"""SQLite repository. Both nodes share ONE file (WAL mode) -> shared history & users.
Fine for local demo; not for production multi-host use. All SQL is parameterised."""
import sqlite3, time, uuid
from contextlib import contextmanager
from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL, bio TEXT DEFAULT '', pw_hash TEXT NOT NULL, created_at REAL);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, kind TEXT NOT NULL,
  title TEXT, created_by TEXT, created_at REAL);
CREATE TABLE IF NOT EXISTS members(conversation_id TEXT, user_id TEXT,
  PRIMARY KEY(conversation_id,user_id));
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL, text TEXT NOT NULL, origin_node TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_msg_conv ON messages(conversation_id, created_at);
"""


@contextmanager
def conn():
    c = sqlite3.connect(settings.DATABASE_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db():
    with conn() as c:
        c.executescript(SCHEMA)
        # seed a public group so a fresh install has something to chat in
        if not c.execute("SELECT 1 FROM conversations WHERE id='general'").fetchone():
            c.execute("INSERT INTO conversations VALUES('general','group','General Chat',NULL,?)", (time.time(),))


def new_id() -> str:
    return uuid.uuid4().hex


def create_user(username, display_name, pw_hash):
    uid = new_id()
    with conn() as c:
        c.execute("INSERT INTO users VALUES(?,?,?,?,?,?)", (uid, username, display_name, "", pw_hash, time.time()))
        c.execute("INSERT OR IGNORE INTO members VALUES('general',?)", (uid,))
    return uid


def get_user_by_name(username):
    with conn() as c:
        return c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()


def get_user(uid):
    with conn() as c:
        return c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()


def search_users(q=""):
    with conn() as c:
        return c.execute("SELECT id,username,display_name FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 50",
                         (f"%{q}%", f"%{q}%")).fetchall()


def update_profile(uid, display_name, bio):
    with conn() as c:
        c.execute("UPDATE users SET display_name=?, bio=? WHERE id=?", (display_name, bio, uid))


def member_ids(cid):
    with conn() as c:
        return [r["user_id"] for r in c.execute("SELECT user_id FROM members WHERE conversation_id=?", (cid,))]


def is_member(cid, uid):
    with conn() as c:
        return c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)).fetchone() is not None


def create_conversation(kind, title, creator, members):
    members = list(dict.fromkeys([creator, *members]))
    with conn() as c:
        if kind == "direct":
            others = [m for m in members if m != creator]
            if len(others) != 1:
                raise ValueError("direct conversations need exactly one other user")
            row = c.execute("""SELECT c.id FROM conversations c JOIN members a ON a.conversation_id=c.id AND a.user_id=?
              JOIN members b ON b.conversation_id=c.id AND b.user_id=? WHERE c.kind='direct'""", (creator, others[0])).fetchone()
            if row:
                return row["id"]
        cid = new_id()
        c.execute("INSERT INTO conversations VALUES(?,?,?,?,?)", (cid, kind, title, creator, time.time()))
        c.executemany("INSERT INTO members VALUES(?,?)", [(cid, m) for m in members])
    return cid


def list_conversations(uid):
    with conn() as c:
        convs = c.execute("""SELECT c.* FROM conversations c JOIN members m ON m.conversation_id=c.id
                             WHERE m.user_id=?""", (uid,)).fetchall()
        out = []
        for cv in convs:
            mem = c.execute("""SELECT u.id,u.display_name,u.username FROM members m JOIN users u ON u.id=m.user_id
                               WHERE m.conversation_id=?""", (cv["id"],)).fetchall()
            last = c.execute("SELECT text,created_at FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1",
                             (cv["id"],)).fetchone()
            title = cv["title"]
            if cv["kind"] == "direct":
                title = next((m["display_name"] for m in mem if m["id"] != uid), "Direct")
            out.append({"id": cv["id"], "kind": cv["kind"], "title": title,
                        "members": [dict(m) for m in mem],
                        "last_text": last["text"] if last else None, "last_at": last["created_at"] if last else None})
        return out


def save_message(mid, cid, sender, text, node, created_at):
    with conn() as c:
        c.execute("INSERT INTO messages VALUES(?,?,?,?,?,?)", (mid, cid, sender, text, node, created_at))


def history(cid, limit=100):
    with conn() as c:
        rows = c.execute("""SELECT m.id,m.conversation_id,m.sender_id,u.display_name sender_name,m.text,m.created_at,m.origin_node
          FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=?
          ORDER BY m.created_at DESC LIMIT ?""", (cid, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]
