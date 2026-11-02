"""Run: DATABASE_PATH=/tmp/t.db pytest  (no Redis needed: covers auth, membership, envelope)."""
import os, tempfile
os.environ["DATABASE_PATH"] = os.path.join(tempfile.mkdtemp(), "t.db")
from app import db
from app.auth import check_pw, hash_pw, make_token, decode_token
from app.schemas import EventEnvelope, SendIn
import pytest


def test_password_hash():
    h = hash_pw("correct horse")
    assert h != "correct horse" and check_pw("correct horse", h) and not check_pw("nope", h)


def test_token_roundtrip():
    assert decode_token(make_token("u1")) == "u1" and decode_token("garbage") is None


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
