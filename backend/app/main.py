import asyncio, json, logging, sqlite3, time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError
from . import db
from .auth import RateLimiter, check_pw, current_user_id, decode_token, hash_pw, make_token
from .config import settings
from .hub import hub
from .schemas import (ContactMatchIn, ConversationIn, ConversationUpdateIn, DeleteEnvelope, EditEnvelope, EditMessageIn, EventEnvelope, LoginIn, ProfileIn, ReceiptEnvelope, RegisterIn, SendIn, TypingIn, TypingEnvelope)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [" + settings.SERVER_ID + "] %(name)s: %(message)s")
log = logging.getLogger("vakochat")
auth_limiter = RateLimiter(10, 60)
msg_limiter = RateLimiter(30, 10)
typing_limiter = RateLimiter(20, 5)
receipt_limiter = RateLimiter(150, 10)
MAX_FRAME = 16 * 1024
MAX_AVATAR_BYTES = 2 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    await hub.start()
    yield
    await hub.stop()  # graceful: close sockets, remove heartbeat key


production = settings.ENVIRONMENT.lower() == "production"
app = FastAPI(
    title="Vakochat node",
    lifespan=lifespan,
    docs_url=None if production else "/docs",
    redoc_url=None if production else "/redoc",
    openapi_url=None if production else "/openapi.json",
)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def reject_disabled_node(request, call_next):
    allowed = request.url.path in ("/health/live", "/health/ready") or \
              request.url.path.startswith("/api/monitoring/") or \
              request.url.path.startswith("/api/admin/")
    if not hub.enabled and not allowed:
        return JSONResponse(status_code=503, content={"detail": "node administratively disabled"})
    return await call_next(request)


def public_user(u):
    phone = u["phone"]
    if phone and len(phone) == 12 and phone.startswith("254"):
        phone = f"+{phone}"
    return {"id": u["id"], "username": u["username"], "display_name": u["display_name"], "bio": u["bio"],
            "is_admin": bool(u["is_admin"]) or u["username"].lower() in admin_usernames(),
            "email": u["email"], "phone": phone,
            "avatar_url": f"/api/users/{u['id']}/avatar?v={u['avatar_version'] or ''}" if db.has_avatar(u["id"]) else None}


def admin_usernames() -> set[str]:
    return {name.strip().lower() for name in settings.ADMIN_USERNAMES.split(",") if name.strip()}


def require_admin(uid: str = Depends(current_user_id)):
    user = db.get_user(uid)
    if not user or not (user["is_admin"] or user["username"].lower() in admin_usernames()):
        raise HTTPException(403, "Administrator access required")
    return uid


@app.get("/api/admin/overview")
def admin_overview(_: str = Depends(require_admin)):
    overview = db.admin_overview()
    overview["admins"] = db.count_active_admins(admin_usernames())
    return overview


@app.get("/api/admin/users")
def admin_users(q: str = "", _: str = Depends(require_admin)):
    configured_admins = admin_usernames()
    users = db.list_admin_users(q[:64])
    for user in users:
        user["is_admin"] = bool(user["is_admin"]) or user["username"].lower() in configured_admins
        user["managed_by_config"] = user["username"].lower() in configured_admins
    return users


@app.put("/api/admin/users/{user_id}/admin")
def update_user_admin(user_id: str, enabled: bool, uid: str = Depends(require_admin)):
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if not enabled and target["username"].lower() in admin_usernames():
        raise HTTPException(409, "This administrator is managed by the server configuration")
    if not enabled and target["is_admin"]:
        if user_id == uid:
            raise HTTPException(409, "You cannot remove your own administrator access")
        if db.count_active_admins(admin_usernames()) <= 1:
            raise HTTPException(409, "At least one active administrator must remain")
    if not db.set_user_admin(user_id, enabled):
        raise HTTPException(404, "User not found")
    db.record_audit(uid, "admin.role_changed", user_id, json.dumps({"is_admin": enabled}))
    return {"user_id": user_id, "is_admin": enabled}


@app.put("/api/admin/users/{user_id}/suspended")
async def update_user_suspended(user_id: str, enabled: bool, uid: str = Depends(require_admin)):
    target = db.get_user(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if enabled and user_id == uid:
        raise HTTPException(409, "You cannot suspend your own account")
    if enabled and (target["is_admin"] or target["username"].lower() in admin_usernames()):
        if db.count_active_admins(admin_usernames()) <= 1:
            raise HTTPException(409, "At least one active administrator must remain")
    if not db.set_user_suspended(user_id, enabled):
        raise HTTPException(404, "User not found")
    db.record_audit(uid, "admin.account_suspended" if enabled else "admin.account_restored", user_id)
    if enabled:
        await hub.close_user_sockets(user_id)
    return {"user_id": user_id, "is_suspended": enabled}


@app.get("/api/admin/audit")
def admin_audit(_: str = Depends(require_admin)):
    return db.list_audit()


# ---------- health / monitoring
@app.get("/health/live")
def live():
    return {"status": "alive", "node_id": settings.SERVER_ID}


@app.get("/health/ready")
def ready():
    if not hub.enabled:
        raise HTTPException(503, "node administratively disabled")
    if not hub.redis_ok:
        raise HTTPException(503, "redis unavailable")
    return {"status": "ready", "node_id": settings.SERVER_ID, "redis": "connected"}


@app.get("/api/monitoring/self")
def mon_self(_: str = Depends(require_admin)):
    return hub.self_status()


@app.get("/api/monitoring/cluster")
async def mon_cluster(_: str = Depends(require_admin)):
    return {**await hub.cluster_status(), "answered_by": settings.SERVER_ID}


@app.put("/api/admin/nodes/{node_id}/enabled")
async def set_node_enabled(node_id: str, enabled: bool, _: str = Depends(require_admin)):
    expected = {node.strip() for node in settings.NODE_IDS.split(",") if node.strip()}
    if node_id not in expected:
        raise HTTPException(404, "Unknown node")
    try:
        await hub.set_node_enabled(node_id, enabled)
    except Exception as e:
        log.exception("failed to update node state")
        raise HTTPException(503, "Node state could not be updated") from e
    db.record_audit(_, "admin.node_state_changed", details=json.dumps({"node_id": node_id, "enabled": enabled}))
    return {"node_id": node_id, "enabled": enabled}


# ---------- auth / profile
@app.post("/api/auth/register")
def register(body: RegisterIn):
    if not auth_limiter.allow("reg"):
        raise HTTPException(429, "Too many attempts")
    if body.username.lower() in admin_usernames():
        raise HTTPException(403, "Administrator accounts must be provisioned by the operator")
    if db.get_user_by_name(body.username.lower()):
        raise HTTPException(409, "Username taken")
    email = body.email.strip().lower() if body.email else None
    phone = db.normalize_phone(body.phone) if body.phone else None
    if body.phone and not phone:
        raise HTTPException(422, "Enter a Kenyan phone number with nine digits after +254")
    try:
        uid = db.create_user(body.username.lower(), body.display_name, hash_pw(body.password), email, phone)
    except sqlite3.IntegrityError as e:
        raise HTTPException(409, "That username, email, or phone number is already registered") from e
    db.record_audit(uid, "account.registered", uid)
    return {"token": make_token(uid), "user": public_user(db.get_user(uid))}


@app.post("/api/auth/login")
def login(body: LoginIn):
    identifier = body.username.strip()
    phone_identifier = db.normalize_phone(identifier)
    rate_limit_key = phone_identifier or identifier.lower()
    if not auth_limiter.allow("login:" + rate_limit_key):
        raise HTTPException(429, "Too many attempts")
    u = db.get_user_by_identifier(identifier)
    if not u or not check_pw(body.password, u["pw_hash"]):
        db.record_audit(u["id"] if u else None, "auth.login_failed", u["id"] if u else None)
        raise HTTPException(401, "Invalid credentials")
    if u["is_suspended"]:
        db.record_audit(u["id"], "auth.suspended_login_blocked", u["id"])
        raise HTTPException(403, "This account is suspended")
    db.record_audit(u["id"], "auth.login_succeeded", u["id"])
    return {"token": make_token(u["id"]), "user": public_user(u)}


@app.get("/api/me")
def me(uid: str = Depends(current_user_id)):
    u = db.get_user(uid)
    if not u:
        raise HTTPException(401, "Unknown user")
    return public_user(u)


@app.put("/api/me")
def update_me(body: ProfileIn, uid: str = Depends(current_user_id)):
    email = body.email.strip().lower() if body.email and body.email.strip() else None
    phone = db.normalize_phone(body.phone) if body.phone and body.phone.strip() else None
    if body.phone and body.phone.strip() and not phone:
        raise HTTPException(422, "Enter nine phone digits after +254")
    try:
        db.update_profile(uid, body.display_name, body.bio, email, phone)
    except sqlite3.IntegrityError as e:
        raise HTTPException(409, "That email or phone number is already registered") from e
    return public_user(db.get_user(uid))


@app.put("/api/me/avatar")
async def upload_avatar(request: Request, uid: str = Depends(current_user_id)):
    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > MAX_AVATAR_BYTES:
            raise HTTPException(413, "Profile pictures must be 2 MB or smaller")
    data = bytes(chunks)
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        content_type = "image/png"
    elif data.startswith(b"\xff\xd8\xff"):
        content_type = "image/jpeg"
    elif len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        content_type = "image/webp"
    else:
        raise HTTPException(415, "Upload a PNG, JPEG, or WebP image")
    if not data:
        raise HTTPException(400, "The uploaded image is empty")
    await asyncio.to_thread(db.set_avatar, uid, data, content_type)
    return public_user(db.get_user(uid))


@app.delete("/api/me/avatar")
def delete_avatar(uid: str = Depends(current_user_id)):
    db.remove_avatar(uid)
    return public_user(db.get_user(uid))


@app.get("/api/users/{user_id}/avatar")
def get_avatar(user_id: str):
    avatar = db.get_avatar(user_id)
    if not avatar:
        raise HTTPException(404, "Profile picture not found")
    data, content_type = avatar
    return Response(data, media_type=content_type,
                    headers={"Cache-Control": "private, no-cache, max-age=0, must-revalidate"})


def image_content_type(data: bytes):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


@app.put("/api/conversations/{cid}/avatar")
async def upload_conversation_avatar(cid: str, request: Request, uid: str = Depends(current_user_id)):
    if not await asyncio.to_thread(db.is_member, cid, uid):
        raise HTTPException(404, "Group not found")
    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > MAX_AVATAR_BYTES:
            raise HTTPException(413, "Group pictures must be 2 MB or smaller")
    data = bytes(chunks)
    if not data:
        raise HTTPException(400, "The uploaded image is empty")
    content_type = image_content_type(data)
    if not content_type:
        raise HTTPException(415, "Upload a PNG, JPEG, or WebP image")
    await asyncio.to_thread(db.set_conversation_avatar, cid, data, content_type)
    return next((conversation for conversation in db.list_conversations(uid) if conversation["id"] == cid), None)


@app.delete("/api/conversations/{cid}/avatar")
async def delete_conversation_avatar(cid: str, uid: str = Depends(current_user_id)):
    if not await asyncio.to_thread(db.is_member, cid, uid):
        raise HTTPException(404, "Group not found")
    if not await asyncio.to_thread(db.remove_conversation_avatar, cid):
        raise HTTPException(404, "Group not found")
    return next((conversation for conversation in db.list_conversations(uid) if conversation["id"] == cid), None)


@app.get("/api/conversations/{cid}/avatar")
def get_conversation_avatar(cid: str):
    avatar = db.get_conversation_avatar(cid)
    if not avatar:
        raise HTTPException(404, "Group picture not found")
    data, content_type = avatar
    return Response(data, media_type=content_type,
                    headers={"Cache-Control": "private, no-cache, max-age=0, must-revalidate"})


@app.get("/api/users")
def users(q: str = "", uid: str = Depends(current_user_id)):
    return [dict(r) for r in db.search_users(q[:32]) if r["id"] != uid]


@app.post("/api/contacts/match")
def match_contacts(body: ContactMatchIn, uid: str = Depends(current_user_id)):
    emails = list({email.strip().lower() for email in body.emails if email.strip()})
    phones = list({phone for item in body.phones if (phone := db.normalize_phone(item))})
    matches = db.match_contacts(emails[:100], phones[:100])
    return [dict(user) for user in matches if user["id"] != uid]


@app.get("/api/presence")
async def presence(uid: str = Depends(current_user_id)):
    online = await hub.online_users()
    return {"available": online is not None, "online": online or []}


# ---------- conversations
@app.get("/api/conversations")
def conversations(uid: str = Depends(current_user_id)):
    return db.list_conversations(uid)


@app.post("/api/conversations")
def new_conversation(body: ConversationIn, uid: str = Depends(current_user_id)):
    if body.kind == "group" and not body.title:
        raise HTTPException(422, "Group title required")
    if any(not db.get_user(m) for m in body.member_ids):
        raise HTTPException(404, "Unknown member")
    try:
        cid = db.create_conversation(body.kind, body.title, uid, body.member_ids, body.description)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return next(c for c in db.list_conversations(uid) if c["id"] == cid)


@app.put("/api/conversations/{cid}")
def update_conversation(cid: str, body: ConversationUpdateIn, uid: str = Depends(current_user_id)):
    if not db.is_member(cid, uid) or not db.update_conversation(cid, body.title.strip(), body.description.strip()):
        raise HTTPException(404, "Group not found")
    return next(c for c in db.list_conversations(uid) if c["id"] == cid)


@app.get("/api/conversations/{cid}/messages")
def messages(cid: str, uid: str = Depends(current_user_id)):
    if not db.is_member(cid, uid):
        raise HTTPException(403, "Not a member")
    return db.history(cid)


# ---------- websocket
async def send_json(ws: WebSocket, obj: dict):
    await ws.send_text(json.dumps(obj))


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    """Protocol: client first frame {type:'auth',token}. Then message.send, typing, or ping.
    Server: auth.ok, message.ack, message.created, typing, error, pong. Identity comes from the token only."""
    await ws.accept()
    uid = None
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=5))
        uid = decode_token(first.get("token", "")) if isinstance(first, dict) and first.get("type") == "auth" else None
        connected_user = db.get_user(uid) if uid else None
        if not connected_user or connected_user["is_suspended"]:
            await send_json(ws, {"type": "error", "code": "auth_failed"})
            await ws.close(code=4401)
            return
        if not await hub.add(uid, ws):
            return
        await send_json(ws, {"type": "auth.ok", "node_id": settings.SERVER_ID})
        while True:
            raw = await ws.receive_text()
            if db.is_suspended(uid):
                await send_json(ws, {"type": "error", "code": "auth_failed"})
                await ws.close(code=4403, reason="This account has been suspended")
                return
            if len(raw) > MAX_FRAME:
                await send_json(ws, {"type": "error", "code": "frame_too_large"})
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_json(ws, {"type": "error", "code": "bad_json", "operation": "frame"})
                continue
            if not isinstance(data, dict):
                await send_json(ws, {"type": "error", "code": "invalid_payload", "operation": "frame"})
                continue
            frame_type = data.get("type")
            if frame_type == "ping":
                await send_json(ws, {"type": "pong", "ts": time.time()})
                continue
            if frame_type in ("typing", "typing.start", "typing.stop"):
                await handle_typing(ws, uid, data)
                continue
            if frame_type in ("message.delivered", "conversation.delivered", "conversation.read"):
                await handle_receipt(ws, uid, data)
                continue
            if frame_type != "message.send":
                request_id = str(data.get("request_id", ""))[:64]
                await send_json(ws, {"type": "error", "code": "invalid_payload",
                                    "request_id": request_id, "operation": "frame"})
                continue
            await handle_send(ws, uid, data)
    except (WebSocketDisconnect, asyncio.TimeoutError, json.JSONDecodeError):
        pass
    except Exception:
        log.exception("ws error")
    finally:
        if uid:
            await hub.remove(uid, ws)


async def handle_send(ws: WebSocket, uid: str, data: dict):
    rid = str(data.get("request_id", ""))[:64]
    try:
        msg = SendIn.model_validate(data)
    except ValidationError:
        return await send_json(ws, {"type": "error", "code": "invalid_payload",
                                    "request_id": rid, "operation": "message"})
    text = msg.text.strip()
    if not text or len(text) > settings.MAX_MESSAGE_CHARS:
        return await send_json(ws, {"type": "error", "code": "invalid_text", "request_id": rid})
    if not msg_limiter.allow(uid):
        return await send_json(ws, {"type": "error", "code": "rate_limited", "request_id": rid})
    # membership is checked server-side on EVERY send
    if not await asyncio.to_thread(db.is_member, msg.conversation_id, uid):
        return await send_json(ws, {"type": "error", "code": "forbidden", "request_id": rid})
    sender = await asyncio.to_thread(db.get_user, uid)
    members = await asyncio.to_thread(db.member_ids, msg.conversation_id)
    mid, eid = db.new_id(), db.new_id()  # created ONCE at origin, kept across hops
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    await asyncio.to_thread(db.save_message, mid, msg.conversation_id, uid, text, settings.SERVER_ID, now)
    env = EventEnvelope(event_id=eid, event_type="chat.message.created", origin_node=settings.SERVER_ID,
                        message_id=mid, conversation_id=msg.conversation_id, sender_id=uid,
                        sender_name=sender["display_name"], recipient_ids=members, created_at=now,
                        payload={"text": text})
    await hub.deliver_local(members, hub.frame_from(env))  # local fan-out (includes sender's other tabs)
    ok = await hub.publish(env)                             # relay to other nodes
    await send_json(ws, {"type": "message.ack", "request_id": rid, "message_id": mid,
                         "status": "accepted" if ok else "accepted_local_only"})


async def handle_typing(ws: WebSocket, uid: str, data: dict):
    try:
        frame = TypingIn.model_validate(data)
    except ValidationError:
        return await send_json(ws, {"type": "error", "code": "invalid_typing_frame", "operation": "typing"})
    if not frame.conversation_id:
        return await send_json(ws, {"type": "error", "code": "invalid_typing_frame", "operation": "typing"})
    if not typing_limiter.allow(uid):
        return await send_json(ws, {"type": "error", "code": "rate_limited", "operation": "typing"})
    if not await asyncio.to_thread(db.is_member, frame.conversation_id, uid):
        return await send_json(ws, {"type": "error", "code": "forbidden", "operation": "typing"})

    is_typing = (False if frame.type == "typing.stop" else True if frame.type == "typing.start"
                 else bool(frame.is_typing))
    sender = await asyncio.to_thread(db.get_user, uid)
    members = await asyncio.to_thread(db.member_ids, frame.conversation_id)
    recipients = [member for member in members if member != uid]
    env = TypingEnvelope(
        event_id=db.new_id(), event_type="chat.typing", origin_node=settings.SERVER_ID,
        conversation_id=frame.conversation_id, sender_id=uid, sender_name=sender["display_name"],
        recipient_ids=recipients,
        created_at=datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        payload={"is_typing": is_typing},
    )
    await hub.deliver_local(recipients, hub.typing_frame_from(env), count_message_delivery=False)
    await hub.publish_typing(env)


async def handle_receipt(ws: WebSocket, uid: str, data: dict):
    cid = data.get("conversation_id")
    if not isinstance(cid, str) or not cid or len(cid) > 64:
        return await send_json(ws, {"type": "error", "code": "invalid_receipt", "operation": "receipt"})
    if not receipt_limiter.allow(uid):
        return await send_json(ws, {"type": "error", "code": "rate_limited", "operation": "receipt"})
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    if data["type"] == "message.delivered":
        mid = data.get("message_id")
        if not isinstance(mid, str) or not mid or len(mid) > 64:
            return await send_json(ws, {"type": "error", "code": "invalid_receipt", "operation": "receipt"})
        receipt = await asyncio.to_thread(db.record_delivery, mid, cid, uid, now, settings.SERVER_ID)
        if receipt and receipt[1] in ("delivered", "read"):
            sender_id, status, delivered_nodes = receipt
            env = ReceiptEnvelope(event_id=db.new_id(), event_type="chat.message.receipt",
                origin_node=settings.SERVER_ID, message_id=mid, conversation_id=cid, sender_id=sender_id,
                recipient_ids=[sender_id], status=status, delivered_nodes=delivered_nodes, created_at=now)
            await hub.deliver_local([sender_id], hub.receipt_frame_from(env), count_message_delivery=False)
            await hub.publish_receipt(env)
        return
    if not await asyncio.to_thread(db.is_member, cid, uid):
        return await send_json(ws, {"type": "error", "code": "forbidden", "operation": "receipt"})
    mark_read = data["type"] == "conversation.read"
    if mark_read:
        receipts = await asyncio.to_thread(db.mark_conversation_read, cid, uid, now, settings.SERVER_ID)
    else:
        receipts = await asyncio.to_thread(db.mark_conversation_delivered, cid, uid, now, settings.SERVER_ID)
    grouped: dict[str, list[str]] = {}
    for receipt in receipts:
        grouped.setdefault(receipt["sender_id"], []).append(receipt["message_id"])
    for sender_id, message_ids in grouped.items():
        for mid in message_ids:
            status = next(r["status"] for r in receipts if r["message_id"] == mid)
            if status not in ("delivered", "read"):
                continue
            env = ReceiptEnvelope(event_id=db.new_id(), event_type="chat.message.receipt",
                origin_node=settings.SERVER_ID, message_id=mid, conversation_id=cid, sender_id=sender_id,
                recipient_ids=[sender_id], status=status,
                delivered_nodes=next(r["delivered_nodes"] for r in receipts if r["message_id"] == mid), created_at=now)
            await hub.deliver_local([sender_id], hub.receipt_frame_from(env), count_message_delivery=False)
            await hub.publish_receipt(env)


@app.delete("/api/messages/{message_id}")
async def delete_message(message_id: str, uid: str = Depends(current_user_id)):
    conversation_id = db.delete_message(message_id, uid)
    if not conversation_id:
        raise HTTPException(404, "Message not found or not yours to delete")
    members = await asyncio.to_thread(db.member_ids, conversation_id)
    env = DeleteEnvelope(event_id=db.new_id(), event_type="chat.message.deleted", origin_node=settings.SERVER_ID,
                         message_id=message_id, conversation_id=conversation_id,
                         recipient_ids=members)
    await hub.deliver_local(env.recipient_ids, hub.delete_frame_from(env), count_message_delivery=False)
    relayed = await hub.publish_delete(env)
    return {"message_id": message_id, "conversation_id": conversation_id,
            "relay_status": "relayed" if relayed else "local_only"}


@app.put("/api/messages/{message_id}")
async def edit_message(message_id: str, body: EditMessageIn, uid: str = Depends(current_user_id)):
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "Message cannot be empty")
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    edited_at = now
    conversation_id = await asyncio.to_thread(db.edit_message, message_id, uid, text, edited_at, now)
    if not conversation_id:
        raise HTTPException(404, "Message not found, not yours to edit, or edit window expired")
    members = await asyncio.to_thread(db.member_ids, conversation_id)
    env = EditEnvelope(event_id=db.new_id(), event_type="chat.message.edited", origin_node=settings.SERVER_ID,
        message_id=message_id, conversation_id=conversation_id, recipient_ids=members, text=text, edited_at=edited_at)
    await hub.deliver_local(env.recipient_ids, hub.edit_frame_from(env), count_message_delivery=False)
    relayed = await hub.publish_edit(env)
    return {"message_id": message_id, "conversation_id": conversation_id, "text": text,
            "edited_at": edited_at, "relay_status": "relayed" if relayed else "local_only"}
