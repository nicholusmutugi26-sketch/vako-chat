"""Run: PYTHONPATH=. pytest (no Redis needed: auth, membership, chat, and profile features)."""
import asyncio, json, os, tempfile
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "t.db")
from app import db
from app.auth import check_pw, hash_pw, make_token, decode_token
from app.schemas import EventEnvelope, SendIn, TypingEnvelope, TypingIn
import pytest


def test_password_hash():
    h = hash_pw("correct horse")
    assert h != "correct horse" and check_pw("correct horse", h) and not check_pw("nope", h)


def test_production_configuration_rejects_unsafe_defaults():
    from pydantic import ValidationError
    from app.config import Settings

    Settings(
        ENVIRONMENT="production",
        APP_SECRET_KEY="s" * 64,
        FRONTEND_ORIGINS="https://chat.example.com",
        ADMIN_USERNAMES="adminvakochat",
    )
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            APP_SECRET_KEY="dev-secret-change-me",
            FRONTEND_ORIGINS="https://chat.example.com",
            ADMIN_USERNAMES="adminvakochat",
        )
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            APP_SECRET_KEY="s" * 64,
            FRONTEND_ORIGINS="http://chat.example.com",
            ADMIN_USERNAMES="adminvakochat",
        )


def test_admin_controls_and_audit_log(monkeypatch):
    from fastapi import HTTPException
    from app import main

    db.init_db()
    monkeypatch.setattr(main.settings, "ADMIN_USERNAMES", "")
    admin = db.create_user("dashboard-admin", "Dashboard Admin", hash_pw("a secure password"), is_admin=True)
    target = db.create_user("dashboard-target", "Target User", hash_pw("a secure password"))

    assert main.admin_overview(admin)["admins"] == 1
    assert main.update_user_admin(target, True, admin)["is_admin"] is True
    result = asyncio.run(main.update_user_suspended(target, True, admin))
    assert result["is_suspended"] is True
    assert db.is_suspended(target)
    with pytest.raises(HTTPException) as exc:
        main.update_user_admin(admin, False, admin)
    assert exc.value.status_code == 409

    db.record_audit(admin, "admin.test_event", target)
    event = next(item for item in db.list_audit() if item["action"] == "admin.test_event")
    assert event["action"] == "admin.test_event"
    assert event["actor_username"] == "dashboard-admin"
    assert event["target_username"] == "dashboard-target"


def test_suspended_accounts_are_rejected_by_existing_tokens():
    from fastapi import HTTPException
    from app.auth import current_user_id

    db.init_db()
    uid = db.create_user("suspended-user", "Suspended User", hash_pw("a secure password"))
    token = make_token(uid)
    assert current_user_id(f"Bearer {token}") == uid
    db.set_user_suspended(uid, True)
    with pytest.raises(HTTPException) as exc:
        current_user_id(f"Bearer {token}")
    assert exc.value.status_code == 403


def test_token_roundtrip():
    assert decode_token(make_token("u1")) == "u1" and decode_token("garbage") is None


def test_allowlisted_admin_cannot_be_self_registered(monkeypatch):
    from fastapi import HTTPException
    from app import main
    from app.schemas import RegisterIn

    monkeypatch.setattr(main.settings, "ADMIN_USERNAMES", "admin")
    monkeypatch.setattr(main.auth_limiter, "allow", lambda key: True)
    with pytest.raises(HTTPException) as exc:
        main.register(RegisterIn(username="admin", display_name="Admin", password="secret123"))
    assert exc.value.status_code == 403


def test_membership_isolated():
    db.init_db()
    a, b, c = (db.create_user(n, n, "x") for n in ("alice", "bob", "carol"))
    cid = db.create_conversation("direct", None, a, [b])
    assert db.is_member(cid, a) and db.is_member(cid, b) and not db.is_member(cid, c)
    assert db.create_conversation("direct", None, b, [a]) == cid  # no duplicate DMs


def test_schema_validation():
    with pytest.raises(Exception):
        SendIn(type="message.send", request_id="1", conversation_id="x", text="")
    e = EventEnvelope(event_id="1", event_type="chat.message.created", origin_node="node-1", message_id="m",
                      conversation_id="c", sender_id="s", sender_name="S", recipient_ids=["a"], created_at="t", payload={})
    assert e.schema_version == 1


def test_typing_frame_validation_and_serialization():
    request = TypingIn(type="typing.start", conversation_id="c1")
    assert request.conversation_id == "c1"
    with pytest.raises(Exception):
        TypingIn(type="typing.start", conversation_id="")
    assert TypingIn(type="typing", conversation_id="c1", is_typing=True).is_typing is True
    assert TypingIn(type="typing.stop", conversation_id="c1").type == "typing.stop"

    event = TypingEnvelope(
        event_id="e1", event_type="chat.typing", origin_node="node-1",
        conversation_id="c1", sender_id="u1", sender_name="Alice",
        recipient_ids=["u2"], created_at="2026-11-02T12:00:00Z",
        payload={"is_typing": True},
    )
    from app.hub import Hub
    assert Hub.typing_frame_from(event) == {
        "type": "typing", "event_id": "e1", "conversation_id": "c1",
        "sender": {"id": "u1", "display_name": "Alice"}, "is_typing": True,
    }


def test_message_receipts_persist_delivery_read_nodes_and_delete():
    db.init_db()
    alice = db.create_user("alice-receipts", "Alice", "x")
    bob = db.create_user("bob-receipts", "Bob", "x")
    carol = db.create_user("carol-receipts", "Carol", "x")
    cid = db.create_conversation("group", "Receipts", alice, [bob, carol])
    mid = db.new_id()
    db.save_message(mid, cid, alice, "hello", "node-1", "2026-11-02T10:00:00Z")

    first = db.record_delivery(mid, cid, bob, "2026-11-02T10:01:00Z", "node-2")
    assert first[:2] == (alice, "delivered") and first[2] == "node-2"
    second = db.record_delivery(mid, cid, carol, "2026-11-02T10:02:00Z", "node-1")
    assert second[:2] == (alice, "delivered") and set(second[2].split(",")) == {"node-1", "node-2"}
    assert db.mark_conversation_read(cid, bob, "2026-11-02T10:03:00Z", "node-2")[0]["status"] == "read"
    assert db.mark_conversation_read(cid, carol, "2026-11-02T10:04:00Z", "node-1")[0]["status"] == "read"

    message = db.history(cid)[0]
    assert message["status"] == "read"
    assert set(message["delivered_nodes"].split(",")) == {"node-1", "node-2"}
    assert db.delete_message(mid, alice) == cid
    assert db.history(cid) == []


def test_message_edits_are_sender_only_and_expire_after_five_minutes():
    db.init_db()
    alice = db.create_user("alice-edits", "Alice", "x")
    bob = db.create_user("bob-edits", "Bob", "x")
    cid = db.create_conversation("direct", None, alice, [bob])
    mid = db.new_id()
    db.save_message(mid, cid, alice, "before", "node-1", "2026-11-02T10:00:00Z")
    assert db.edit_message(mid, alice, "after", "2026-11-02T10:04:00Z", "2026-11-02T10:04:00Z") == cid
    assert db.history(cid)[0]["text"] == "after"
    assert db.history(cid)[0]["edited_at"] == "2026-11-02T10:04:00Z"
    assert db.edit_message(mid, bob, "forged", "2026-11-02T10:04:30Z", "2026-11-02T10:04:30Z") is None
    assert db.edit_message(mid, alice, "late", "2026-11-02T10:06:00Z", "2026-11-02T10:06:00Z") is None


def test_avatar_persistence():
    db.init_db()
    uid = db.create_user("avatar-user", "Avatar", "x")
    assert db.get_avatar(uid) is None and not db.has_avatar(uid)
    db.set_avatar(uid, b"\x89PNG\r\n\x1a\nimage", "image/png")
    assert db.get_avatar(uid) == (b"\x89PNG\r\n\x1a\nimage", "image/png")
    assert db.has_avatar(uid)
    first_url = db.search_users("avatar-user")[0]["avatar_url"]
    db.set_avatar(uid, b"\x89PNG\r\n\x1a\nnew-image", "image/png")
    assert db.search_users("avatar-user")[0]["avatar_url"] != first_url
    db.remove_avatar(uid)
    assert db.get_avatar(uid) is None


def test_email_phone_login_and_phone_contact_matching():
    db.init_db()
    uid = db.create_user("contact-user", "Contact User", "x", "person@example.com", "254712345678")

    assert db.get_user_by_identifier("CONTACT-USER")["id"] == uid
    assert db.get_user_by_identifier("PERSON@example.com")["id"] == uid
    assert db.get_user_by_identifier("+254 (712) 345-678")["id"] == uid
    assert db.normalize_phone("not a phone") is None

    matches = db.match_contacts(["PERSON@example.com"], ["0712 345 678"])
    assert [match["id"] for match in matches] == [uid]
    assert db.match_contacts([], []) == []


def test_profile_details_and_unread_counts_persist():
    db.init_db()
    alice = db.create_user("profile-alice", "Alice", "x")
    bob = db.create_user("profile-bob", "Bob", "x")
    db.update_profile(bob, "Bobby", "bio", "bobby@example.com", "254700000001")
    assert db.get_user(bob)["email"] == "bobby@example.com"
    assert db.get_user(bob)["phone"] == "254700000001"

    cid = db.create_conversation("direct", None, alice, [bob])
    db.save_message("unread-1", cid, alice, "one", "node-1", "2026-11-02T10:00:00Z")
    db.save_message("unread-2", cid, alice, "two", "node-1", "2026-11-02T10:01:00Z")
    assert next(conversation for conversation in db.list_conversations(bob) if conversation["id"] == cid)["unread_count"] == 2
    db.mark_conversation_delivered(cid, bob, "2026-11-02T10:02:00Z", "node-2")
    assert next(conversation for conversation in db.list_conversations(bob) if conversation["id"] == cid)["unread_count"] == 2
    own_conversation = next(conversation for conversation in db.list_conversations(alice) if conversation["id"] == cid)
    assert own_conversation["last_message_sender_id"] == alice
    assert own_conversation["last_message_id"] == "unread-2"
    assert own_conversation["last_message_status"] == "delivered"
    db.mark_conversation_read(cid, bob, "2026-11-02T10:03:00Z", "node-2")
    assert next(conversation for conversation in db.list_conversations(bob) if conversation["id"] == cid)["unread_count"] == 0
    assert next(conversation for conversation in db.list_conversations(alice) if conversation["id"] == cid)["last_message_status"] == "read"


def test_group_description_and_avatar_are_returned_for_members():
    db.init_db()
    alice = db.create_user("group-owner", "Owner", "x")
    bob = db.create_user("group-member", "Member", "x")
    cid = db.create_conversation("group", "Project team", alice, [bob], "Planning and updates")

    conversation = next(item for item in db.list_conversations(bob) if item["id"] == cid)
    assert conversation["description"] == "Planning and updates"
    assert conversation["avatar_url"] is None

    db.set_conversation_avatar(cid, b"\x89PNG\r\n\x1a\ngroup-image", "image/png")
    conversation = next(item for item in db.list_conversations(bob) if item["id"] == cid)
    assert conversation["avatar_url"].startswith(f"/api/conversations/{cid}/avatar?v=")
    assert db.get_conversation_avatar(cid) == (b"\x89PNG\r\n\x1a\ngroup-image", "image/png")
    assert db.update_conversation(cid, "Updated team", "New description")
    conversation = next(item for item in db.list_conversations(bob) if item["id"] == cid)
    assert conversation["title"] == "Updated team"
    assert conversation["description"] == "New description"
    assert db.remove_conversation_avatar(cid)
    conversation = next(item for item in db.list_conversations(bob) if item["id"] == cid)
    assert conversation["avatar_url"] is None


def test_group_unread_counts_include_messages_before_latest_own_message():
    db.init_db()
    alice = db.create_user("group-unread-alice", "Alice", "x")
    bob = db.create_user("group-unread-bob", "Bob", "x")
    cid = db.create_conversation("group", "Unread group", alice, [bob])
    db.save_message("group-incoming", cid, alice, "Incoming", "node-1", "2026-11-02T10:00:00Z")
    db.save_message("group-own", cid, bob, "My reply", "node-1", "2026-11-02T10:01:00Z")

    conversation = next(item for item in db.list_conversations(bob) if item["id"] == cid)
    assert conversation["unread_count"] == 1
    assert conversation["last_message_sender_id"] == bob


def test_typing_broadcast_checks_membership_and_uses_authenticated_sender(monkeypatch):
    from app import main

    delivered = []
    published = []
    monkeypatch.setattr(main.typing_limiter, "allow", lambda uid: True)
    monkeypatch.setattr(main.db, "is_member", lambda cid, uid: cid == "c1" and uid == "u1")
    monkeypatch.setattr(main.db, "get_user", lambda uid: {"display_name": "Alice"})
    monkeypatch.setattr(main.db, "member_ids", lambda cid: ["u1", "u2"])

    async def deliver_local(recipients, frame, count_message_delivery=True):
        delivered.append((recipients, frame, count_message_delivery))

    async def publish_typing(event):
        published.append(event)
        return True

    monkeypatch.setattr(main.hub, "deliver_local", deliver_local)
    monkeypatch.setattr(main.hub, "publish_typing", publish_typing)

    class FakeWebSocket:
        def __init__(self):
            self.frames = []

        async def send_text(self, text):
            self.frames.append(json.loads(text))

    ws = FakeWebSocket()
    asyncio.run(main.handle_typing(ws, "u1", {
        "type": "typing.start", "conversation_id": "c1", "sender_id": "forged",
    }))
    assert delivered[0][0] == ["u2"]
    assert delivered[0][1]["sender"] == {"id": "u1", "display_name": "Alice"}
    assert delivered[0][1]["is_typing"] is True
    assert delivered[0][2] is False
    assert published[0].recipient_ids == ["u2"]

    delivered.clear()
    published.clear()
    asyncio.run(main.handle_typing(ws, "outsider", {
        "type": "typing.start", "conversation_id": "c1",
    }))
    assert ws.frames == [{"type": "error", "code": "forbidden", "operation": "typing"}]
    assert delivered == [] and published == []
