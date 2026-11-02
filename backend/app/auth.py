import time, jwt, bcrypt
from fastapi import Header, HTTPException
from .config import settings
from . import db


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode()[:72], bcrypt.gensalt()).decode()


def check_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode()[:72], h.encode())
    except ValueError:
        return False


def make_token(uid: str) -> str:
    now = int(time.time())
    return jwt.encode({"sub": uid, "iat": now, "exp": now + settings.TOKEN_TTL_MINUTES * 60},
                      settings.APP_SECRET_KEY, algorithm="HS256")


def decode_token(t: str) -> str | None:
    try:
        return jwt.decode(t, settings.APP_SECRET_KEY, algorithms=["HS256"])["sub"]
    except jwt.PyJWTError:
        return None


def current_user_id(authorization: str = Header(default="")) -> str:
    uid = decode_token(authorization.removeprefix("Bearer ").strip())
    if not uid:
        raise HTTPException(401, "Invalid or expired token")
    if db.is_suspended(uid):
        raise HTTPException(403, "This account is suspended")
    return uid


class RateLimiter:
    """Tiny in-memory per-key sliding window (per node)."""
    def __init__(self, n, window):
        self.n, self.w, self.hits = n, window, {}

    def allow(self, key) -> bool:
        now = time.monotonic()
        q = [t for t in self.hits.get(key, []) if now - t < self.w]
        ok = len(q) < self.n
        if ok:
            q.append(now)
        self.hits[key] = q
        return ok
