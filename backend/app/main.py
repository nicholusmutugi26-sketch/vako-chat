import asyncio, json, logging, time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from . import db
from .auth import RateLimiter, check_pw, current_user_id, decode_token, hash_pw, make_token
from .config import settings
from .hub import hub
from .schemas import (ConversationIn, EventEnvelope, LoginIn, ProfileIn, RegisterIn, SendIn)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [" + settings.SERVER_ID + "] %(name)s: %(message)s")
log = logging.getLogger("vakochat")
auth_limiter = RateLimiter(10, 60)
msg_limiter = RateLimiter(30, 10)
MAX_FRAME = 16 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    await hub.start()
    yield
    await hub.stop()  # graceful: close sockets, remove heartbeat key


app = FastAPI(title="Vakochat node", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_methods=["*"], allow_headers=["*"])


def public_user(u):
    return {"id": u["id"], "username": u["username"], "display_name": u["display_name"], "bio": u["bio"]}


# ---------- health / monitoring
@app.get("/health/live")
def live():
    return {"status": "alive", "node_id": settings.SERVER_ID}


@app.get("/health/ready")
def ready():
    if not hub.redis_ok:
        raise HTTPException(503, "redis unavailable")
    return {"status": "ready", "node_id": settings.SERVER_ID, "redis": "connected"}


@app.get("/api/monitoring/self")
def mon_self():
    return hub.self_status()


@app.get("/api/monitoring/cluster")
async def mon_cluster():
    return {**await hub.cluster_status(), "answered_by": settings.SERVER_ID}


# ---------- auth / profile
@app.post("/api/auth/register")
def register(body: RegisterIn):
    if not auth_limiter.allow("reg"):
        raise HTTPException(429, "Too many attempts")
    if db.get_user_by_name(body.username.lower()):
        raise HTTPException(409, "Username taken")
    uid = db.create_user(body.username.lower(), body.display_name, hash_pw(body.password))
    return {"token": make_token(uid), "user": public_user(db.get_user(uid))}


@app.post("/api/auth/login")
def login(body: LoginIn):
    if not auth_limiter.allow("login:" + body.username.lower()):
        raise HTTPException(429, "Too many attempts")
    u = db.get_user_by_name(body.username.lower())
    if not u or not check_pw(body.password, u["pw_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return {"token": make_token(u["id"]), "user": public_user(u)}


@app.get("/api/me")
def me(uid: str = Depends(current_user_id)):
    u = db.get_user(uid)
    if not u:
        raise HTTPException(401, "Unknown user")
    return public_user(u)


@app.put("/api/me")
def update_me(body: ProfileIn, uid: str = Depends(current_user_id)):
    db.update_profile(uid, body.display_name, body.bio)
    return public_user(db.get_user(uid))


@app.get("/api/users")
def users(q: str = "", uid: str = Depends(current_user_id)):
    return [dict(r) for r in db.search_users(q[:32]) if r["id"] != uid]


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
        cid = db.create_conversation(body.kind, body.title, uid, body.member_ids)
    except ValueError as e:
        raise HTTPException(422, str(e))
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
    """Protocol: client first frame {type:'auth',token}. Then message.send / ping.
    Server: auth.ok, message.ack, message.created, error, pong. Identity comes from the token only."""
    await ws.accept()
    uid = None
    try:
        first = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=5))
        uid = decode_token(first.get("token", "")) if first.get("type") == "auth" else None
        if not uid or not db.get_user(uid):
            await send_json(ws, {"type": "error", "code": "auth_failed"})
            await ws.close(code=4401)
            return
        await hub.add(uid, ws)
        await send_json(ws, {"type": "auth.ok", "node_id": settings.SERVER_ID})
        while True:
            raw = await ws.receive_text()
            if len(raw) > MAX_FRAME:
                await send_json(ws, {"type": "error", "code": "frame_too_large"})
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_json(ws, {"type": "error", "code": "bad_json"})
                continue
            if data.get("type") == "ping":
                await send_json(ws, {"type": "pong", "ts": time.time()})
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
        return await send_json(ws, {"type": "error", "code": "invalid_payload", "request_id": rid})
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
