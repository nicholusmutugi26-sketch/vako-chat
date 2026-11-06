"""SQLite repository. Both nodes share ONE file (WAL mode) -> shared history & users.
Fine for local demo; not for production multi-host use. All SQL is parameterised."""
import sqlite3, time, uuid
from contextlib import contextmanager
from .config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL, bio TEXT DEFAULT '', pw_hash TEXT NOT NULL, created_at REAL,
  avatar_data BLOB, avatar_content_type TEXT, email TEXT UNIQUE, phone TEXT UNIQUE,
  avatar_version TEXT, is_admin INTEGER NOT NULL DEFAULT 0, is_suspended INTEGER NOT NULL DEFAULT 0,
  is_verified INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, kind TEXT NOT NULL,
  title TEXT, created_by TEXT, created_at REAL, description TEXT DEFAULT '',
  avatar_data BLOB, avatar_content_type TEXT, avatar_version TEXT);
CREATE TABLE IF NOT EXISTS members(conversation_id TEXT, user_id TEXT,
  PRIMARY KEY(conversation_id,user_id));
CREATE TABLE IF NOT EXISTS hidden_conversations(conversation_id TEXT NOT NULL, user_id TEXT NOT NULL,
  hidden_at REAL NOT NULL, PRIMARY KEY(conversation_id,user_id));
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL, text TEXT NOT NULL, origin_node TEXT, created_at TEXT NOT NULL, edited_at TEXT);
CREATE TABLE IF NOT EXISTS message_receipts(message_id TEXT NOT NULL, user_id TEXT NOT NULL,
  delivered_at TEXT, read_at TEXT, delivered_node TEXT, read_node TEXT,
  PRIMARY KEY(message_id,user_id));
CREATE TABLE IF NOT EXISTS admin_audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT,
  action TEXT NOT NULL, target_id TEXT, details TEXT NOT NULL DEFAULT '', created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS verification_applications(user_id TEXT PRIMARY KEY, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', created_at REAL NOT NULL, reviewed_at REAL, reviewed_by TEXT);
CREATE TABLE IF NOT EXISTS stories(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, text TEXT NOT NULL DEFAULT '',
  image_data BLOB, image_content_type TEXT, audience TEXT NOT NULL DEFAULT 'all', created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS story_views(story_id TEXT NOT NULL, viewer_id TEXT NOT NULL, viewed_at REAL NOT NULL,
  PRIMARY KEY(story_id,viewer_id));
CREATE TABLE IF NOT EXISTS story_reactions(story_id TEXT NOT NULL, user_id TEXT NOT NULL, reaction TEXT NOT NULL,
  created_at REAL NOT NULL, PRIMARY KEY(story_id,user_id));
CREATE TABLE IF NOT EXISTS user_follows(follower_id TEXT NOT NULL, followed_id TEXT NOT NULL,
  created_at REAL NOT NULL, PRIMARY KEY(follower_id,followed_id));
CREATE TABLE IF NOT EXISTS group_admins(conversation_id TEXT NOT NULL, user_id TEXT NOT NULL,
  PRIMARY KEY(conversation_id,user_id));
CREATE TABLE IF NOT EXISTS group_invites(id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL, invitee_id TEXT NOT NULL, created_at REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', UNIQUE(conversation_id,invitee_id));
CREATE INDEX IF NOT EXISTS ix_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_stories_user_created ON stories(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ix_user_follows_followed ON user_follows(followed_id,created_at DESC);
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
        receipt_columns = {row["name"] for row in c.execute("PRAGMA table_info(message_receipts)")}
        if "delivered_node" not in receipt_columns:
            c.execute("ALTER TABLE message_receipts ADD COLUMN delivered_node TEXT")
        if "read_node" not in receipt_columns:
            c.execute("ALTER TABLE message_receipts ADD COLUMN read_node TEXT")
        user_columns = {row["name"] for row in c.execute("PRAGMA table_info(users)")}
        if "avatar_data" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN avatar_data BLOB")
        if "avatar_content_type" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN avatar_content_type TEXT")
        if "email" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN email TEXT")
        if "phone" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN phone TEXT")
        if "avatar_version" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN avatar_version TEXT")
        if "is_admin" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
        if "is_suspended" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0")
        if "is_verified" not in user_columns:
            c.execute("ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email)")
        c.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users(phone)")
        c.execute("""UPDATE users SET avatar_version=lower(hex(randomblob(8)))
                     WHERE avatar_data IS NOT NULL AND avatar_version IS NULL""")
        c.execute("""INSERT OR IGNORE INTO group_admins(conversation_id,user_id)
                     SELECT id,created_by FROM conversations
                     WHERE kind='group' AND created_by IS NOT NULL""")
        conversation_columns = {row["name"] for row in c.execute("PRAGMA table_info(conversations)")}
        if "description" not in conversation_columns:
            c.execute("ALTER TABLE conversations ADD COLUMN description TEXT DEFAULT ''")
        if "avatar_data" not in conversation_columns:
            c.execute("ALTER TABLE conversations ADD COLUMN avatar_data BLOB")
        if "avatar_content_type" not in conversation_columns:
            c.execute("ALTER TABLE conversations ADD COLUMN avatar_content_type TEXT")
        if "avatar_version" not in conversation_columns:
            c.execute("ALTER TABLE conversations ADD COLUMN avatar_version TEXT")
        c.execute("""UPDATE conversations SET avatar_version=lower(hex(randomblob(8)))
                     WHERE avatar_data IS NOT NULL AND avatar_version IS NULL""")
        message_columns = {row["name"] for row in c.execute("PRAGMA table_info(messages)")}
        if "edited_at" not in message_columns:
            c.execute("ALTER TABLE messages ADD COLUMN edited_at TEXT")
        story_columns = {row["name"] for row in c.execute("PRAGMA table_info(stories)")}
        if "audience" not in story_columns:
            c.execute("ALTER TABLE stories ADD COLUMN audience TEXT NOT NULL DEFAULT 'all'")
        # seed a public group so a fresh install has something to chat in
        if not c.execute("SELECT 1 FROM conversations WHERE id='general'").fetchone():
            c.execute("""INSERT INTO conversations(id,kind,title,created_by,created_at,description)
                         VALUES('general','group','General Chat',NULL,?,'')""", (time.time(),))


def new_id() -> str:
    return uuid.uuid4().hex


def create_user(username, display_name, pw_hash, email=None, phone=None, is_admin=False):
    uid = new_id()
    with conn() as c:
        c.execute("""INSERT INTO users(id,username,display_name,bio,pw_hash,created_at,email,phone,is_admin)
                     VALUES(?,?,?,?,?,?,?,?,?)""",
                  (uid, username, display_name, "", pw_hash, time.time(), email, phone, int(is_admin)))
        c.execute("INSERT OR IGNORE INTO members VALUES('general',?)", (uid,))
    return uid


def is_suspended(uid):
    with conn() as c:
        row = c.execute("SELECT is_suspended FROM users WHERE id=?", (uid,)).fetchone()
        return row is None or bool(row["is_suspended"])


def admin_overview():
    with conn() as c:
        users = c.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
        admins = c.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin=1").fetchone()["count"]
        groups = c.execute("SELECT COUNT(*) AS count FROM conversations WHERE kind='group' AND id<>'general'").fetchone()["count"]
        messages = c.execute("SELECT COUNT(*) AS count FROM messages").fetchone()["count"]
        suspended = c.execute("SELECT COUNT(*) AS count FROM users WHERE is_suspended=1").fetchone()["count"]
        return {"users": users, "admins": admins, "groups": groups, "messages": messages, "suspended": suspended}


def list_admin_users(query=""):
    pattern = f"%{query}%"
    with conn() as c:
        rows = c.execute("""SELECT id,username,display_name,email,created_at,is_admin,is_suspended,is_verified
          FROM users WHERE username LIKE ? COLLATE NOCASE OR display_name LIKE ? COLLATE NOCASE
          ORDER BY created_at DESC LIMIT 200""", (pattern, pattern)).fetchall()
        return [dict(row) for row in rows]


def submit_verification_application(uid, reason):
    with conn() as c:
        user = c.execute("SELECT is_verified FROM users WHERE id=? AND is_suspended=0", (uid,)).fetchone()
        if not user:
            return "user_not_found"
        if user["is_verified"]:
            return "verified"
        existing = c.execute("SELECT status FROM verification_applications WHERE user_id=?", (uid,)).fetchone()
        if existing and existing["status"] == "pending":
            return "pending"
        c.execute("""INSERT INTO verification_applications(user_id,reason,status,created_at,reviewed_at,reviewed_by)
          VALUES(?,?,'pending',?,NULL,NULL)
          ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,status='pending',
            created_at=excluded.created_at,reviewed_at=NULL,reviewed_by=NULL""", (uid, reason, time.time()))
        return "pending"


def get_verification_application(uid):
    with conn() as c:
        user = c.execute("SELECT is_verified FROM users WHERE id=?", (uid,)).fetchone()
        row = c.execute("""SELECT user_id,reason,status,created_at,reviewed_at
          FROM verification_applications WHERE user_id=?""", (uid,)).fetchone()
        if not user:
            return None
        return {"is_verified": bool(user["is_verified"]), "application": dict(row) if row else None}


def list_verification_applications(status="pending"):
    with conn() as c:
        rows = c.execute("""SELECT a.user_id,a.reason,a.status,a.created_at,a.reviewed_at,u.is_verified,
          u.username,u.display_name,
          CASE WHEN u.avatar_content_type IS NOT NULL
            THEN '/api/users/' || u.id || '/avatar?v=' || COALESCE(u.avatar_version,'') END avatar_url
          FROM verification_applications a JOIN users u ON u.id=a.user_id
          WHERE a.status=? AND u.is_suspended=0 ORDER BY a.created_at ASC LIMIT 200""", (status,)).fetchall()
        return [dict(row) for row in rows]


def review_verification_application(uid, admin_id, approved):
    status = "approved" if approved else "denied"
    with conn() as c:
        application = c.execute("""SELECT 1 FROM verification_applications
          WHERE user_id=? AND status='pending'""", (uid,)).fetchone()
        if not application:
            return False
        c.execute("""UPDATE verification_applications SET status=?,reviewed_at=?,reviewed_by=?
          WHERE user_id=? AND status='pending'""", (status, time.time(), admin_id, uid))
        c.execute("UPDATE users SET is_verified=? WHERE id=?", (int(approved), uid))
        return True


def set_user_admin(uid, enabled):
    with conn() as c:
        return c.execute("UPDATE users SET is_admin=? WHERE id=?", (int(enabled), uid)).rowcount > 0


def set_user_suspended(uid, enabled):
    with conn() as c:
        return c.execute("UPDATE users SET is_suspended=? WHERE id=?", (int(enabled), uid)).rowcount > 0


def count_active_admins(config_admin_usernames):
    names = {name.strip().lower() for name in config_admin_usernames if name.strip()}
    with conn() as c:
        if not names:
            return c.execute("SELECT COUNT(*) AS count FROM users WHERE is_admin=1 AND is_suspended=0").fetchone()["count"]
        marks = ",".join("?" for _ in names)
        return c.execute(
            f"SELECT COUNT(*) AS count FROM users WHERE is_suspended=0 AND (is_admin=1 OR lower(username) IN ({marks}))",
            tuple(names),
        ).fetchone()["count"]


def record_audit(actor_id, action, target_id=None, details=""):
    with conn() as c:
        c.execute("INSERT INTO admin_audit_log(actor_id,action,target_id,details,created_at) VALUES(?,?,?,?,?)",
                  (actor_id, action, target_id, details, time.time()))


def list_audit(limit=100):
    with conn() as c:
        rows = c.execute("""SELECT a.id,a.action,a.details,a.created_at,a.actor_id,a.target_id,
          actor.username actor_username,actor.display_name actor_name,
          target.username target_username,target.display_name target_name
          FROM admin_audit_log a
          LEFT JOIN users actor ON actor.id=a.actor_id
          LEFT JOIN users target ON target.id=a.target_id
          ORDER BY a.created_at DESC LIMIT ?""", (limit,)).fetchall()
        return [dict(row) for row in rows]


def create_story(uid, text, image_data=None, image_content_type=None, audience="all"):
    story_id = new_id()
    with conn() as c:
        _purge_expired_stories(c)
        c.execute("""INSERT INTO stories(id,user_id,text,image_data,image_content_type,audience,created_at)
                     VALUES(?,?,?,?,?,?,?)""",
                  (story_id, uid, text, image_data, image_content_type, audience, time.time()))
    return story_id


def _story_visible_to(c, story_id, viewer_id):
    return c.execute("""SELECT 1 FROM stories s
      WHERE s.id=? AND (
        s.user_id=? OR (
          EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followed_id=s.user_id)
          AND (s.audience IN ('all','followers','both')
            OR (s.audience='messages' AND EXISTS(
          SELECT 1 FROM conversations cv
          JOIN members own ON own.conversation_id=cv.id AND own.user_id=s.user_id
          JOIN members viewer ON viewer.conversation_id=cv.id AND viewer.user_id=?
          JOIN messages msg ON msg.conversation_id=cv.id
          WHERE cv.kind='direct')))
        )
      )""", (story_id, viewer_id, viewer_id, viewer_id)).fetchone() is not None


def _purge_expired_stories(c):
    cutoff = time.time() - 24 * 60 * 60
    c.execute("DELETE FROM story_views WHERE story_id IN (SELECT id FROM stories WHERE created_at<=?)", (cutoff,))
    c.execute("DELETE FROM stories WHERE created_at<=?", (cutoff,))


def list_stories(viewer_id):
    with conn() as c:
        _purge_expired_stories(c)
        cutoff = time.time() - 24 * 60 * 60
        rows = c.execute("""SELECT s.id,s.user_id,s.text,s.image_content_type,s.created_at,
          CASE WHEN v.viewer_id IS NULL THEN 0 ELSE 1 END viewed,
          CASE WHEN s.user_id=? THEN
            (SELECT COUNT(*) FROM story_views own_views WHERE own_views.story_id=s.id) ELSE 0 END view_count,
          (SELECT COUNT(*) FROM story_reactions reactions WHERE reactions.story_id=s.id) reaction_count,
          (SELECT reaction FROM story_reactions own_reaction WHERE own_reaction.story_id=s.id AND own_reaction.user_id=?) my_reaction,
          u.display_name,u.username,u.avatar_version,u.is_verified,
          CASE WHEN u.avatar_data IS NOT NULL
            THEN '/api/users/' || u.id || '/avatar?v=' || COALESCE(u.avatar_version,'') END avatar_url
          FROM (SELECT * FROM stories WHERE created_at>? ORDER BY created_at DESC LIMIT 500) s
          JOIN users u ON u.id=s.user_id
          LEFT JOIN story_views v ON v.story_id=s.id AND v.viewer_id=?
          WHERE u.is_suspended=0 AND (
            s.user_id=? OR (
              EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followed_id=s.user_id)
              AND (s.audience IN ('all','followers','both')
                OR (s.audience='messages' AND EXISTS(
              SELECT 1 FROM conversations cv
              JOIN members own ON own.conversation_id=cv.id AND own.user_id=s.user_id
              JOIN members viewer ON viewer.conversation_id=cv.id AND viewer.user_id=?
              JOIN messages msg ON msg.conversation_id=cv.id
              WHERE cv.kind='direct')))
            )
          )
          ORDER BY s.created_at ASC""",
                         (viewer_id, viewer_id, cutoff, viewer_id, viewer_id, viewer_id, viewer_id)).fetchall()
        return [dict(row) for row in rows]


def get_story_image(story_id, viewer_id):
    cutoff = time.time() - 24 * 60 * 60
    with conn() as c:
        if not _story_visible_to(c, story_id, viewer_id):
            return None
        row = c.execute("""SELECT image_data,image_content_type FROM stories
                           WHERE id=? AND created_at>? AND image_data IS NOT NULL""",
                        (story_id, cutoff)).fetchone()
        return (row["image_data"], row["image_content_type"]) if row else None


def mark_story_viewed(story_id, viewer_id):
    cutoff = time.time() - 24 * 60 * 60
    with conn() as c:
        story = c.execute("""SELECT user_id FROM stories WHERE id=? AND created_at>?""",
                           (story_id, cutoff)).fetchone()
        if not story or story["user_id"] == viewer_id or not _story_visible_to(c, story_id, viewer_id):
            return False
        c.execute("""INSERT OR IGNORE INTO story_views(story_id,viewer_id,viewed_at)
                     VALUES(?,?,?)""", (story_id, viewer_id, time.time()))
        return True


def toggle_story_reaction(story_id, viewer_id, reaction):
    cutoff = time.time() - 24 * 60 * 60
    with conn() as c:
        story = c.execute("SELECT user_id FROM stories WHERE id=? AND created_at>?", (story_id, cutoff)).fetchone()
        if not story or story["user_id"] == viewer_id or not _story_visible_to(c, story_id, viewer_id):
            return None
        existing = c.execute("SELECT reaction FROM story_reactions WHERE story_id=? AND user_id=?",
                             (story_id, viewer_id)).fetchone()
        if existing and existing["reaction"] == reaction:
            c.execute("DELETE FROM story_reactions WHERE story_id=? AND user_id=?", (story_id, viewer_id))
            selected = None
        else:
            c.execute("""INSERT INTO story_reactions(story_id,user_id,reaction,created_at) VALUES(?,?,?,?)
              ON CONFLICT(story_id,user_id) DO UPDATE SET reaction=excluded.reaction,created_at=excluded.created_at""",
                      (story_id, viewer_id, reaction, time.time()))
            selected = reaction
        count = c.execute("SELECT COUNT(*) FROM story_reactions WHERE story_id=?", (story_id,)).fetchone()[0]
        return {"reaction": selected, "count": count}


def list_story_reactions(story_id, owner_id):
    cutoff = time.time() - 24 * 60 * 60
    with conn() as c:
        story = c.execute("SELECT 1 FROM stories WHERE id=? AND user_id=? AND created_at>?",
                          (story_id, owner_id, cutoff)).fetchone()
        if not story:
            return None
        rows = c.execute("""SELECT u.id,u.username,u.display_name,u.is_verified,r.reaction,r.created_at,
          CASE WHEN u.avatar_data IS NOT NULL
            THEN '/api/users/' || u.id || '/avatar?v=' || COALESCE(u.avatar_version,'') END avatar_url
          FROM story_reactions r JOIN users u ON u.id=r.user_id
          WHERE r.story_id=? AND u.is_suspended=0 ORDER BY r.created_at DESC""", (story_id,)).fetchall()
        return [dict(row) for row in rows]


def story_viewers(story_id, owner_id):
    cutoff = time.time() - 24 * 60 * 60
    with conn() as c:
        story = c.execute(
            "SELECT 1 FROM stories WHERE id=? AND user_id=? AND created_at>?",
            (story_id, owner_id, cutoff),
        ).fetchone()
        if not story:
            return None
        rows = c.execute("""SELECT u.id,u.username,u.display_name,u.is_verified,v.viewed_at,
          CASE WHEN u.avatar_data IS NOT NULL
            THEN '/api/users/' || u.id || '/avatar?v=' || COALESCE(u.avatar_version,'') END avatar_url
          FROM story_views v JOIN users u ON u.id=v.viewer_id
          WHERE v.story_id=? AND u.is_suspended=0
          ORDER BY v.viewed_at DESC""", (story_id,)).fetchall()
        return [dict(row) for row in rows]


def delete_story(story_id, uid):
    with conn() as c:
        result = c.execute("DELETE FROM stories WHERE id=? AND user_id=?", (story_id, uid))
        if result.rowcount:
            c.execute("DELETE FROM story_views WHERE story_id=?", (story_id,))
        return result.rowcount > 0


def get_user_by_name(username):
    with conn() as c:
        return c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()


def normalize_phone(value):
    digits = "".join(character for character in value if character.isdigit())
    if len(digits) == 9:
        return "254" + digits
    if len(digits) == 10 and digits.startswith("0"):
        return "254" + digits[1:]
    if len(digits) == 12 and digits.startswith("254"):
        return digits
    return None


def get_user_by_identifier(identifier):
    value = identifier.strip()
    with conn() as c:
        user = c.execute("SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE",
                         (value, value)).fetchone()
        if user:
            return user
        phone = normalize_phone(value)
        if phone:
            return c.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        return None


def get_user(uid):
    with conn() as c:
        return c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()


def search_users(q="", viewer_id=None):
    with conn() as c:
        return c.execute("""SELECT id,username,display_name,is_verified,
          CASE WHEN avatar_content_type IS NOT NULL
            THEN '/api/users/' || id || '/avatar?v=' || COALESCE(avatar_version, '') END avatar_url,
          EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followed_id=users.id) is_following,
          (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id=users.id) follower_count
          FROM users WHERE is_suspended=0 AND (username LIKE ? OR display_name LIKE ?)
          ORDER BY display_name COLLATE NOCASE LIMIT 50""",
                         (viewer_id, f"%{q}%", f"%{q}%")).fetchall()


def follow_user(follower_id, followed_id):
    if follower_id == followed_id:
        return False
    with conn() as c:
        target = c.execute("SELECT 1 FROM users WHERE id=? AND is_suspended=0", (followed_id,)).fetchone()
        if not target:
            return False
        c.execute("INSERT OR IGNORE INTO user_follows(follower_id,followed_id,created_at) VALUES(?,?,?)",
                  (follower_id, followed_id, time.time()))
        return True


def unfollow_user(follower_id, followed_id):
    with conn() as c:
        return c.execute("DELETE FROM user_follows WHERE follower_id=? AND followed_id=?",
                         (follower_id, followed_id)).rowcount > 0


def follow_counts(uid):
    with conn() as c:
        return {
            "followers": c.execute("SELECT COUNT(*) AS count FROM user_follows WHERE followed_id=?", (uid,)).fetchone()["count"],
            "following": c.execute("SELECT COUNT(*) AS count FROM user_follows WHERE follower_id=?", (uid,)).fetchone()["count"],
        }


def follow_list(uid, relationship, viewer_id=None):
    if relationship not in ("followers", "following"):
        raise ValueError("Invalid follow relationship")
    column = "followed_id" if relationship == "followers" else "follower_id"
    with conn() as c:
        rows = c.execute(f"""SELECT u.id,u.username,u.display_name,u.bio,u.is_verified,
          CASE WHEN u.avatar_content_type IS NOT NULL
            THEN '/api/users/' || u.id || '/avatar?v=' || COALESCE(u.avatar_version, '') END avatar_url,
          EXISTS(SELECT 1 FROM user_follows own WHERE own.follower_id=? AND own.followed_id=u.id) is_following,
          (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id=u.id) follower_count
          FROM user_follows f JOIN users u ON u.id=f.{('follower_id' if relationship == 'followers' else 'followed_id')}
          WHERE f.{column}=? AND u.is_suspended=0
          ORDER BY f.created_at DESC LIMIT 200""", (viewer_id or uid, uid)).fetchall()
        return [dict(row) for row in rows]


def public_profile(user_id, viewer_id):
    with conn() as c:
        row = c.execute("""SELECT u.id,u.username,u.display_name,u.bio,u.is_verified,
          CASE WHEN u.avatar_content_type IS NOT NULL
            THEN '/api/users/' || u.id || '/avatar?v=' || COALESCE(u.avatar_version, '') END avatar_url,
          EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followed_id=u.id) is_following,
          (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id=u.id) follower_count,
          (SELECT COUNT(*) FROM user_follows f WHERE f.follower_id=u.id) following_count
          FROM users u WHERE u.id=? AND u.is_suspended=0""", (viewer_id, user_id)).fetchone()
        return dict(row) if row else None


def match_contacts(emails, phones, viewer_id=None):
    emails = list({email.strip().lower() for email in emails if email.strip()})
    phones = list({phone for value in phones if (phone := normalize_phone(value))})
    clauses, values = [], []
    if emails:
        clauses.append("email IN (" + ",".join("?" for _ in emails) + ")")
        values.extend(emails)
    if phones:
        clauses.append("phone IN (" + ",".join("?" for _ in phones) + ")")
        values.extend(phones)
    if not clauses:
        return []
    values.insert(0, viewer_id)
    with conn() as c:
        return c.execute("""SELECT id,username,display_name,is_verified,
          CASE WHEN avatar_content_type IS NOT NULL
            THEN '/api/users/' || id || '/avatar?v=' || COALESCE(avatar_version, '') END avatar_url,
          EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followed_id=users.id) is_following,
          (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id=users.id) follower_count
          FROM users WHERE (""" + " OR ".join(clauses) + ") AND is_suspended=0 LIMIT 100", values).fetchall()


def update_profile(uid, display_name, bio, email, phone):
    with conn() as c:
        c.execute("UPDATE users SET display_name=?, bio=?, email=?, phone=? WHERE id=?",
                  (display_name, bio, email, phone, uid))


def member_ids(cid):
    with conn() as c:
        return [r["user_id"] for r in c.execute("SELECT user_id FROM members WHERE conversation_id=?", (cid,))]


def is_member(cid, uid):
    with conn() as c:
        return c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)).fetchone() is not None


def create_conversation(kind, title, creator, members, description=""):
    members = list(dict.fromkeys([creator, *members]))
    with conn() as c:
        if kind == "direct":
            others = [m for m in members if m != creator]
            if len(others) != 1:
                raise ValueError("direct conversations need exactly one other user")
            row = c.execute("""SELECT c.id FROM conversations c JOIN members a ON a.conversation_id=c.id AND a.user_id=?
              JOIN members b ON b.conversation_id=c.id AND b.user_id=? WHERE c.kind='direct'""", (creator, others[0])).fetchone()
            if row:
                c.execute("DELETE FROM hidden_conversations WHERE conversation_id=? AND user_id=?",
                          (row["id"], creator))
                return row["id"]
        cid = new_id()
        c.execute("""INSERT INTO conversations(id,kind,title,created_by,created_at,description)
                     VALUES(?,?,?,?,?,?)""", (cid, kind, title, creator, time.time(), description))
        c.executemany("INSERT INTO members VALUES(?,?)", [(cid, m) for m in members])
        if kind == "group":
            c.execute("INSERT OR IGNORE INTO group_admins(conversation_id,user_id) VALUES(?,?)", (cid, creator))
    return cid


def update_conversation(cid, title, description):
    with conn() as c:
        result = c.execute(
            "UPDATE conversations SET title=?, description=? WHERE id=? AND kind='group'",
            (title, description, cid),
        )
        return result.rowcount > 0


def is_group_admin(cid, uid):
    with conn() as c:
        return c.execute("""SELECT 1 FROM conversations c
          LEFT JOIN group_admins a ON a.conversation_id=c.id AND a.user_id=?
          LEFT JOIN users u ON u.id=?
          WHERE c.id=? AND c.kind='group' AND (c.created_by=? OR a.user_id IS NOT NULL OR u.is_admin=1)""",
                         (uid, uid, cid, uid)).fetchone() is not None


def create_group_invite(cid, inviter_id, invitee_id):
    invite_id = new_id()
    with conn() as c:
        if not c.execute("SELECT 1 FROM conversations WHERE id=? AND kind='group'", (cid,)).fetchone():
            return None, "group_not_found"
        if not c.execute("SELECT 1 FROM users WHERE id=? AND is_suspended=0", (invitee_id,)).fetchone():
            return None, "user_not_found"
        if c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, invitee_id)).fetchone():
            return None, "already_member"
        existing = c.execute("""SELECT id,status FROM group_invites
                                WHERE conversation_id=? AND invitee_id=?""", (cid, invitee_id)).fetchone()
        if existing and existing["status"] == "pending":
            return existing["id"], "pending"
        if existing:
            c.execute("UPDATE group_invites SET inviter_id=?,created_at=?,status='pending' WHERE id=?",
                      (inviter_id, time.time(), existing["id"]))
            return existing["id"], "pending"
        c.execute("""INSERT INTO group_invites(id,conversation_id,inviter_id,invitee_id,created_at,status)
                     VALUES(?,?,?,?,?,'pending')""", (invite_id, cid, inviter_id, invitee_id, time.time()))
        return invite_id, "pending"


def list_group_invites(uid):
    with conn() as c:
        rows = c.execute("""SELECT i.id,i.conversation_id,i.created_at,c.title,c.description,
          CASE WHEN c.avatar_content_type IS NOT NULL
            THEN '/api/conversations/' || c.id || '/avatar?v=' || COALESCE(c.avatar_version,'') END avatar_url,
          inviter.display_name inviter_name,inviter.username inviter_username
          FROM group_invites i JOIN conversations c ON c.id=i.conversation_id
          JOIN users inviter ON inviter.id=i.inviter_id
          WHERE i.invitee_id=? AND i.status='pending' AND c.kind='group'
          ORDER BY i.created_at DESC LIMIT 100""", (uid,)).fetchall()
        return [dict(row) for row in rows]


def respond_group_invite(invite_id, uid, accept):
    with conn() as c:
        invite = c.execute("""SELECT conversation_id FROM group_invites
                              WHERE id=? AND invitee_id=? AND status='pending'""",
                           (invite_id, uid)).fetchone()
        if not invite:
            return None
        cid = invite["conversation_id"]
        if accept:
            c.execute("INSERT OR IGNORE INTO members(conversation_id,user_id) VALUES(?,?)", (cid, uid))
        c.execute("UPDATE group_invites SET status=? WHERE id=?",
                  ("accepted" if accept else "declined", invite_id))
        return cid


def update_group_admin(cid, user_id, enabled):
    with conn() as c:
        if not c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, user_id)).fetchone():
            return False
        if enabled:
            c.execute("INSERT OR IGNORE INTO group_admins(conversation_id,user_id) VALUES(?,?)", (cid, user_id))
        else:
            owner = c.execute("SELECT created_by FROM conversations WHERE id=?", (cid,)).fetchone()
            if owner and owner["created_by"] == user_id:
                return False
            c.execute("DELETE FROM group_admins WHERE conversation_id=? AND user_id=?", (cid, user_id))
        return True


def remove_group_member(cid, user_id):
    with conn() as c:
        if not c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, user_id)).fetchone():
            return False
        admins = c.execute("SELECT COUNT(*) AS count FROM group_admins WHERE conversation_id=?", (cid,)).fetchone()["count"]
        is_admin = c.execute("SELECT 1 FROM group_admins WHERE conversation_id=? AND user_id=?", (cid, user_id)).fetchone()
        if is_admin and admins <= 1:
            return False
        c.execute("DELETE FROM members WHERE conversation_id=? AND user_id=?", (cid, user_id))
        c.execute("DELETE FROM group_admins WHERE conversation_id=? AND user_id=?", (cid, user_id))
        c.execute("DELETE FROM group_invites WHERE conversation_id=? AND invitee_id=?", (cid, user_id))
        return True


def leave_group(cid, uid):
    with conn() as c:
        group = c.execute("SELECT created_by FROM conversations WHERE id=? AND kind='group'", (cid,)).fetchone()
        if not group or not c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)).fetchone():
            return False
        remaining = c.execute("SELECT COUNT(*) AS count FROM members WHERE conversation_id=? AND user_id<>?",
                              (cid, uid)).fetchone()["count"]
        if remaining == 0:
            return False
        c.execute("DELETE FROM members WHERE conversation_id=? AND user_id=?", (cid, uid))
        c.execute("DELETE FROM group_admins WHERE conversation_id=? AND user_id=?", (cid, uid))
        if group["created_by"] == uid:
            replacement = c.execute("""SELECT m.user_id FROM members m
              LEFT JOIN group_admins a ON a.conversation_id=m.conversation_id AND a.user_id=m.user_id
              WHERE m.conversation_id=? ORDER BY CASE WHEN a.user_id IS NOT NULL THEN 0 ELSE 1 END,m.rowid LIMIT 1""",
                                    (cid,)).fetchone()["user_id"]
            c.execute("UPDATE conversations SET created_by=? WHERE id=?", (replacement, cid))
            c.execute("INSERT OR IGNORE INTO group_admins(conversation_id,user_id) VALUES(?,?)", (cid, replacement))
        c.execute("DELETE FROM group_invites WHERE conversation_id=? AND invitee_id=?", (cid, uid))
        return True


def list_conversations(uid):
    with conn() as c:
        convs = c.execute("""SELECT c.* FROM conversations c JOIN members m ON m.conversation_id=c.id
                             WHERE m.user_id=? AND NOT EXISTS(
                               SELECT 1 FROM hidden_conversations h
                               WHERE h.conversation_id=c.id AND h.user_id=m.user_id
                                 AND h.hidden_at >= COALESCE((
                                   SELECT MAX((julianday(msg.created_at)-2440587.5)*86400.0)
                                   FROM messages msg WHERE msg.conversation_id=c.id
                                 ),0)
                             )""", (uid,)).fetchall()
        out = []
        for cv in convs:
            mem = c.execute("""SELECT u.id,u.display_name,u.username,u.is_verified,
                                      CASE WHEN u.avatar_content_type IS NOT NULL
                                        THEN '/api/users/' || u.id || '/avatar?v=' || COALESCE(u.avatar_version, '') END avatar_url,
                                      EXISTS(SELECT 1 FROM group_admins a WHERE a.conversation_id=m.conversation_id AND a.user_id=u.id) is_admin,
                                      EXISTS(SELECT 1 FROM user_follows f WHERE f.follower_id=? AND f.followed_id=u.id) is_following,
                                      (SELECT COUNT(*) FROM user_follows f WHERE f.followed_id=u.id) follower_count
                               FROM members m JOIN users u ON u.id=m.user_id
                               WHERE m.conversation_id=?""", (uid, cv["id"])).fetchall()
            last = c.execute("""SELECT id,text,created_at,sender_id FROM messages
                WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1""",
                             (cv["id"],)).fetchone()
            unread = c.execute("""SELECT COUNT(*) FROM messages m
                LEFT JOIN message_receipts r ON r.message_id=m.id AND r.user_id=?
                WHERE m.conversation_id=? AND m.sender_id<>? AND r.read_at IS NULL""",
                               (uid, cv["id"], uid)).fetchone()[0]
            title = cv["title"]
            if cv["kind"] == "direct":
                title = next((m["display_name"] for m in mem if m["id"] != uid), "Direct")
            last_status = None
            if last and last["sender_id"] == uid:
                last_status = _message_receipt_status(c, last["id"], cv["id"], uid)[0]
            avatar_url = None
            if cv["avatar_content_type"]:
                avatar_url = f"/api/conversations/{cv['id']}/avatar?v={cv['avatar_version'] or ''}"
            out.append({"id": cv["id"], "kind": cv["kind"], "title": title,
                        "description": cv["description"] or "", "avatar_url": avatar_url,
                        "members": [dict(m) for m in mem],
                        "last_text": last["text"] if last else None, "last_at": last["created_at"] if last else None,
                        "last_message_id": last["id"] if last else None,
                        "last_message_sender_id": last["sender_id"] if last else None,
                        "last_message_status": last_status,
                        "unread_count": unread,
                        "is_admin": bool(cv["created_by"] == uid or c.execute(
                            "SELECT 1 FROM group_admins WHERE conversation_id=? AND user_id=?", (cv["id"], uid)
                        ).fetchone() or c.execute("SELECT is_admin FROM users WHERE id=?", (uid,)).fetchone()["is_admin"])})
        return out


def save_message(mid, cid, sender, text, node, created_at):
    with conn() as c:
        c.execute("""INSERT INTO messages(id,conversation_id,sender_id,text,origin_node,created_at)
          VALUES(?,?,?,?,?,?)""", (mid, cid, sender, text, node, created_at))


def history(cid, limit=100):
    with conn() as c:
        rows = c.execute("""SELECT m.id,m.conversation_id,m.sender_id,u.display_name sender_name,m.text,m.created_at,m.edited_at,m.origin_node,
          CASE
            WHEN EXISTS(SELECT 1 FROM message_receipts r JOIN members x
                        ON x.conversation_id=m.conversation_id AND x.user_id=r.user_id
                        WHERE r.message_id=m.id AND r.read_at IS NOT NULL) THEN 'read'
            WHEN EXISTS(SELECT 1 FROM message_receipts r JOIN members x
                        ON x.conversation_id=m.conversation_id AND x.user_id=r.user_id
                        WHERE r.message_id=m.id AND r.delivered_at IS NOT NULL) THEN 'delivered'
            ELSE 'sent' END status,
          (SELECT group_concat(DISTINCT r.delivered_node) FROM message_receipts r WHERE r.message_id=m.id AND r.delivered_node IS NOT NULL) delivered_nodes
          FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.conversation_id=?
          ORDER BY m.created_at DESC LIMIT ?""", (cid, limit)).fetchall()
    return [dict(r) for r in reversed(rows)]


def _message_receipt_status(c, mid, cid, sender_id):
    recipients = c.execute("SELECT COUNT(*) count FROM members WHERE conversation_id=? AND user_id<>?",
                           (cid, sender_id)).fetchone()["count"]
    counts = c.execute("""SELECT COUNT(read_at) read_count, COUNT(delivered_at) delivered_count
      FROM message_receipts WHERE message_id=?""", (mid,)).fetchone()
    status = "read" if counts["read_count"] else "delivered" if counts["delivered_count"] else "sent"
    nodes = c.execute("SELECT group_concat(DISTINCT delivered_node) nodes FROM message_receipts WHERE message_id=?",
                      (mid,)).fetchone()["nodes"]
    return status, nodes


def record_delivery(mid, cid, uid, at, node):
    with conn() as c:
        message = c.execute("SELECT sender_id FROM messages WHERE id=? AND conversation_id=?", (mid, cid)).fetchone()
        if not message or message["sender_id"] == uid:
            return None
        member = c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)).fetchone()
        if not member:
            return None
        c.execute("""INSERT INTO message_receipts(message_id,user_id,delivered_at,delivered_node)
          VALUES(?,?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET
          delivered_at=COALESCE(delivered_at,excluded.delivered_at),
          delivered_node=COALESCE(delivered_node,excluded.delivered_node)""", (mid, uid, at, node))
        status, nodes = _message_receipt_status(c, mid, cid, message["sender_id"])
        return message["sender_id"], status, nodes


def mark_conversation_read(cid, uid, at, node):
    with conn() as c:
        member = c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)).fetchone()
        if not member:
            return []
        rows = c.execute("SELECT id,sender_id FROM messages WHERE conversation_id=? AND sender_id<>?", (cid, uid)).fetchall()
        for row in rows:
            c.execute("""INSERT INTO message_receipts(message_id,user_id,delivered_at,read_at,delivered_node,read_node)
              VALUES(?,?,?,?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET
              delivered_at=COALESCE(delivered_at,excluded.delivered_at),
              read_at=COALESCE(read_at,excluded.read_at),
              delivered_node=COALESCE(delivered_node,excluded.delivered_node),
              read_node=COALESCE(read_node,excluded.read_node)""", (row["id"], uid, at, at, node, node))
        return [{"message_id": row["id"], "sender_id": row["sender_id"],
                 "status": _message_receipt_status(c, row["id"], cid, row["sender_id"])[0],
                 "delivered_nodes": _message_receipt_status(c, row["id"], cid, row["sender_id"])[1]} for row in rows]


def mark_conversation_delivered(cid, uid, at, node):
    with conn() as c:
        member = c.execute("SELECT 1 FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)).fetchone()
        if not member:
            return []
        rows = c.execute("SELECT id,sender_id FROM messages WHERE conversation_id=? AND sender_id<>?", (cid, uid)).fetchall()
        results = []
        for row in rows:
            c.execute("""INSERT INTO message_receipts(message_id,user_id,delivered_at,delivered_node)
              VALUES(?,?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET
              delivered_at=COALESCE(delivered_at,excluded.delivered_at),
              delivered_node=COALESCE(delivered_node,excluded.delivered_node)""",
                      (row["id"], uid, at, node))
            status, nodes = _message_receipt_status(c, row["id"], cid, row["sender_id"])
            results.append({"message_id": row["id"], "sender_id": row["sender_id"],
                            "status": status, "delivered_nodes": nodes})
        return results


def delete_message(mid, uid):
    with conn() as c:
        row = c.execute("SELECT conversation_id FROM messages WHERE id=? AND sender_id=?", (mid, uid)).fetchone()
        if not row:
            return None
        c.execute("DELETE FROM message_receipts WHERE message_id=?", (mid,))
        c.execute("DELETE FROM messages WHERE id=?", (mid,))
        return row["conversation_id"]


def delete_messages(message_ids, uid):
    if not message_ids or len(message_ids) > 100 or len(set(message_ids)) != len(message_ids):
        return None
    placeholders = ",".join("?" for _ in message_ids)
    with conn() as c:
        rows = c.execute(
            f"SELECT id,conversation_id,sender_id FROM messages WHERE id IN ({placeholders})",
            tuple(message_ids),
        ).fetchall()
        if len(rows) != len(message_ids) or any(row["sender_id"] != uid for row in rows):
            return None
        c.execute(f"DELETE FROM message_receipts WHERE message_id IN ({placeholders})", tuple(message_ids))
        c.execute(f"DELETE FROM messages WHERE id IN ({placeholders})", tuple(message_ids))
        return [{"message_id": row["id"], "conversation_id": row["conversation_id"]} for row in rows]


def hide_conversation(cid, uid):
    with conn() as c:
        row = c.execute("""SELECT c.kind FROM conversations c JOIN members m ON m.conversation_id=c.id
                           WHERE c.id=? AND m.user_id=?""", (cid, uid)).fetchone()
        if not row:
            return "not_found"
        if row["kind"] != "direct":
            return "group"
        c.execute("""INSERT INTO hidden_conversations(conversation_id,user_id,hidden_at) VALUES(?,?,?)
                     ON CONFLICT(conversation_id,user_id) DO UPDATE SET hidden_at=excluded.hidden_at""",
                  (cid, uid, time.time()))
        return "hidden"


def edit_message(mid, uid, text, edited_at, now):
    from datetime import datetime
    with conn() as c:
        row = c.execute("SELECT conversation_id,created_at FROM messages WHERE id=? AND sender_id=?", (mid, uid)).fetchone()
        if not row:
            return None
        try:
            created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
            current = datetime.fromisoformat(now.replace("Z", "+00:00"))
        except ValueError:
            return None
        if (current - created).total_seconds() < 0 or (current - created).total_seconds() > 5 * 60:
            return None
        c.execute("UPDATE messages SET text=?, edited_at=? WHERE id=?", (text, edited_at, mid))
        return row["conversation_id"]


def set_avatar(uid, content, content_type):
    with conn() as c:
        c.execute("UPDATE users SET avatar_data=?, avatar_content_type=?, avatar_version=? WHERE id=?",
                  (content, content_type, uuid.uuid4().hex, uid))


def has_avatar(uid):
    with conn() as c:
        return c.execute("SELECT 1 FROM users WHERE id=? AND avatar_data IS NOT NULL", (uid,)).fetchone() is not None


def get_avatar(uid):
    with conn() as c:
        row = c.execute("SELECT avatar_data,avatar_content_type FROM users WHERE id=?", (uid,)).fetchone()
        return (row["avatar_data"], row["avatar_content_type"]) if row and row["avatar_data"] else None


def remove_avatar(uid):
    with conn() as c:
        c.execute("UPDATE users SET avatar_data=NULL, avatar_content_type=NULL, avatar_version=NULL WHERE id=?", (uid,))


def set_conversation_avatar(cid, content, content_type):
    with conn() as c:
        c.execute("""UPDATE conversations SET avatar_data=?,avatar_content_type=?,avatar_version=?
                     WHERE id=? AND kind='group'""", (content, content_type, uuid.uuid4().hex, cid))


def remove_conversation_avatar(cid):
    with conn() as c:
        result = c.execute("""UPDATE conversations
                              SET avatar_data=NULL,avatar_content_type=NULL,avatar_version=NULL
                              WHERE id=? AND kind='group'""", (cid,))
        return result.rowcount > 0


def get_conversation_avatar(cid):
    with conn() as c:
        row = c.execute("""SELECT avatar_data,avatar_content_type FROM conversations
                           WHERE id=? AND kind='group'""", (cid,)).fetchone()
        return (row["avatar_data"], row["avatar_content_type"]) if row and row["avatar_data"] else None
