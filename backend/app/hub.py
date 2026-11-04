"""Connection registry + Redis Pub/Sub relay + heartbeats + real traffic counters.

Delivery semantics: Redis Pub/Sub is at-most-once with no replay. The origin node
delivers to its own local sockets directly (so a Redis outage still works for
same-node users) and publishes for the other nodes; subscribers ignore events
whose origin_node is themselves. Clients dedupe on message_id.
"""
import asyncio, json, logging, time
from collections import defaultdict
import redis.asyncio as aioredis
from fastapi import WebSocket
from pydantic import ValidationError
from .config import settings
from .schemas import DeleteEnvelope, EditEnvelope, EventEnvelope, ReceiptEnvelope, TypingEnvelope

log = logging.getLogger("vakochat.hub")
CHANNEL = "vakochat:events"


def minute_bucket(ts=None) -> int:
    return int((ts or time.time()) // 60)


class Hub:
    def __init__(self):
        self.node = settings.SERVER_ID
        self.started = time.time()
        self.sockets: dict[str, set[WebSocket]] = defaultdict(set)  # user_id -> sockets (local only)
        self.redis: aioredis.Redis | None = None
        self.redis_subscriber: aioredis.Redis | None = None
        self.redis_ok = False
        self.enabled = True
        self.last_check = None
        self.tasks: list[asyncio.Task] = []
        self.sent_total = 0       # messages accepted by this node since start
        self.delivered_total = 0  # frames written to local sockets since start

    # ---- lifecycle
    async def start(self):
        self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True,
                                       socket_connect_timeout=2, socket_timeout=5)
        # A blocking Pub/Sub read must not inherit the command client's read timeout.
        self.redis_subscriber = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2,
        )
        try:
            control = await self.redis.get(f"vakochat:node-control:{self.node}")
            self.enabled = control != "disabled"
        except Exception as e:
            log.warning("node state unavailable at startup (%s)", type(e).__name__)
        self.tasks = [asyncio.create_task(self._subscriber()), asyncio.create_task(self._heartbeat())]

    async def stop(self):
        for t in self.tasks:
            t.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        for conns in list(self.sockets.values()):
            for ws in list(conns):
                try:
                    await ws.close(code=1001)
                except Exception:
                    pass
        if self.redis:
            try:
                await self.redis.delete(f"vakochat:node:{self.node}")
            except Exception:
                pass
            await self.redis.aclose()
        if self.redis_subscriber:
            await self.redis_subscriber.aclose()

    # ---- local registry
    @property
    def connection_count(self) -> int:
        return sum(len(s) for s in self.sockets.values())

    async def add(self, uid: str, ws: WebSocket) -> bool:
        if not self.enabled:
            await ws.close(code=1013, reason="This node is administratively disabled")
            return False
        self.sockets[uid].add(ws)
        await self._mark_presence(uid)
        return True

    async def set_node_enabled(self, node_id: str, enabled: bool):
        await self.redis.set(f"vakochat:node-control:{node_id}", "enabled" if enabled else "disabled")
        if node_id == self.node:
            await self._apply_enabled(enabled)

    async def _apply_enabled(self, enabled: bool):
        self.enabled = enabled
        if not enabled:
            for connections in list(self.sockets.values()):
                for ws in list(connections):
                    try:
                        await ws.close(code=1013, reason="This node is administratively disabled")
                    except Exception:
                        log.warning("could not close a websocket during node drain")
            self.sockets.clear()

    async def remove(self, uid: str, ws: WebSocket):
        self.sockets[uid].discard(ws)
        if not self.sockets[uid]:
            self.sockets.pop(uid, None)
            try:
                await self.redis.delete(f"vakochat:presence:{uid}:{self.node}")
            except Exception:
                pass

    async def close_user_sockets(self, uid: str):
        connections = self.sockets.pop(uid, set())
        for ws in connections:
            try:
                await ws.close(code=4403, reason="This account has been suspended")
            except Exception:
                log.warning("could not close a suspended user's websocket")
        try:
            await self.redis.delete(f"vakochat:presence:{uid}:{self.node}")
        except Exception:
            log.warning("could not clear presence for a suspended user")

    async def _mark_presence(self, uid):
        try:
            await self.redis.set(f"vakochat:presence:{uid}:{self.node}", "1", ex=settings.HEARTBEAT_TTL_S * 3)
        except Exception:
            pass

    async def online_users(self) -> list[str] | None:
        """None = unavailable (Redis down) -> never fabricate."""
        try:
            ids = set()
            async for k in self.redis.scan_iter("vakochat:presence:*", count=200):
                ids.add(k.split(":")[2])
            return sorted(ids)
        except Exception:
            return None

    # ---- messaging
    async def deliver_local(self, recipient_ids: list[str], frame: dict, count_message_delivery: bool = True):
        data = json.dumps(frame)
        for uid in recipient_ids:
            for ws in list(self.sockets.get(uid, ())):
                try:
                    await ws.send_text(data)
                    if count_message_delivery:
                        self.delivered_total += 1
                        await self._count("delivered")
                except Exception:
                    self.sockets[uid].discard(ws)

    async def publish(self, env: EventEnvelope) -> bool:
        """Returns True if Redis accepted the publish."""
        self.sent_total += 1
        await self._count("sent")
        try:
            await self.redis.publish(CHANNEL, env.model_dump_json())
            return True
        except Exception as e:
            self.redis_ok = False
            log.warning("redis publish failed: %s", type(e).__name__)
            return False

    async def publish_typing(self, env: TypingEnvelope) -> bool:
        """Relay ephemeral typing state without including it in message traffic counters."""
        try:
            await self.redis.publish(CHANNEL, env.model_dump_json())
            return True
        except Exception as e:
            self.redis_ok = False
            log.warning("redis typing publish failed: %s", type(e).__name__)
            return False

    async def publish_receipt(self, env: ReceiptEnvelope) -> bool:
        try:
            await self.redis.publish(CHANNEL, env.model_dump_json())
            return True
        except Exception as e:
            self.redis_ok = False
            log.warning("redis receipt publish failed: %s", type(e).__name__)
            return False

    async def publish_delete(self, env: DeleteEnvelope) -> bool:
        try:
            await self.redis.publish(CHANNEL, env.model_dump_json())
            return True
        except Exception as e:
            self.redis_ok = False
            log.warning("redis delete publish failed: %s", type(e).__name__)
            return False

    async def publish_edit(self, env: EditEnvelope) -> bool:
        try:
            await self.redis.publish(CHANNEL, env.model_dump_json())
            return True
        except Exception as e:
            self.redis_ok = False
            log.warning("redis edit publish failed: %s", type(e).__name__)
            return False

    @staticmethod
    def frame_from(env: EventEnvelope) -> dict:
        return {"type": "message.created", "event_id": env.event_id, "message_id": env.message_id,
                "conversation_id": env.conversation_id,
                "sender": {"id": env.sender_id, "display_name": env.sender_name},
                "text": env.payload.get("text", ""), "created_at": env.created_at, "origin_node": env.origin_node}

    @staticmethod
    def typing_frame_from(env: TypingEnvelope) -> dict:
        return {"type": "typing", "event_id": env.event_id, "conversation_id": env.conversation_id,
                "sender": {"id": env.sender_id, "display_name": env.sender_name},
                "is_typing": env.payload.is_typing}

    @staticmethod
    def receipt_frame_from(env: ReceiptEnvelope) -> dict:
        return {"type": "message.status", "message_id": env.message_id,
                "conversation_id": env.conversation_id, "status": env.status,
                "delivered_nodes": env.delivered_nodes}

    @staticmethod
    def delete_frame_from(env: DeleteEnvelope) -> dict:
        return {"type": "message.deleted", "message_id": env.message_id,
                "conversation_id": env.conversation_id}

    @staticmethod
    def edit_frame_from(env: EditEnvelope) -> dict:
        return {"type": "message.edited", "message_id": env.message_id,
                "conversation_id": env.conversation_id, "text": env.text, "edited_at": env.edited_at}

    async def _count(self, field):
        try:
            k = f"vakochat:traffic:{self.node}:{minute_bucket()}"
            async with self.redis.pipeline() as p:
                p.hincrby(k, field, 1)
                p.expire(k, 3 * 3600)
                await p.execute()
        except Exception:
            pass

    async def _subscriber(self):
        backoff = 1
        while True:
            ps = None
            try:
                ps = self.redis_subscriber.pubsub()
                await ps.subscribe(CHANNEL)
                self.redis_ok = True
                backoff = 1
                log.info("subscribed to %s", CHANNEL)
                async for m in ps.listen():
                    if m["type"] != "message":
                        continue
                    try:
                        env = EventEnvelope.model_validate_json(m["data"])
                        frame = self.frame_from(env)
                    except ValidationError:
                        try:
                            typing = TypingEnvelope.model_validate_json(m["data"])
                            env = typing
                            frame = self.typing_frame_from(typing)
                        except ValidationError:
                            try:
                                receipt = ReceiptEnvelope.model_validate_json(m["data"])
                                env = receipt
                                frame = self.receipt_frame_from(receipt)
                            except ValidationError:
                                try:
                                    deleted = DeleteEnvelope.model_validate_json(m["data"])
                                    env = deleted
                                    frame = self.delete_frame_from(deleted)
                                except ValidationError:
                                    try:
                                        edited = EditEnvelope.model_validate_json(m["data"])
                                        env = edited
                                        frame = self.edit_frame_from(edited)
                                    except ValidationError:
                                        log.warning("dropped invalid event envelope")
                                        continue
                    if env.origin_node == self.node:
                        continue  # origin already delivered locally
                    recipients = [env.sender_id] if isinstance(env, ReceiptEnvelope) else env.recipient_ids
                    await self.deliver_local(recipients, frame,
                                             count_message_delivery=frame["type"] == "message.created")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self.redis_ok = False
                log.warning("subscriber error (%s); retry in %ss", type(e).__name__, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 15)
            finally:
                if ps:
                    await ps.aclose()

    async def _heartbeat(self):
        while True:
            try:
                await self.redis.ping()
                self.redis_ok = True
                self.last_check = time.time()
                control = await self.redis.get(f"vakochat:node-control:{self.node}")
                await self._apply_enabled(control != "disabled")
                await self.redis.set(f"vakochat:node:{self.node}", json.dumps({
                    "node_id": self.node, "port": settings.PORT, "ts": time.time(),
                    "started": self.started, "connections": self.connection_count, "enabled": self.enabled}),
                    ex=settings.HEARTBEAT_TTL_S)
                if self.enabled:
                    for uid in list(self.sockets):
                        await self._mark_presence(uid)
            except asyncio.CancelledError:
                raise
            except Exception:
                self.redis_ok = False
                self.last_check = time.time()
            await asyncio.sleep(settings.HEARTBEAT_EVERY_S)

    # ---- monitoring
    def self_status(self) -> dict:
        return {"node_id": self.node, "port": settings.PORT, "uptime_s": round(time.time() - self.started, 1),
                "connections": self.connection_count, "redis": "connected" if self.redis_ok else "disconnected",
                "enabled": self.enabled,
                "last_check": self.last_check, "sent_since_start": self.sent_total,
                "delivered_since_start": self.delivered_total}

    async def cluster_status(self) -> dict:
        try:
            await self.redis.ping()
        except Exception:
            return {"redis": "disconnected", "nodes": [], "traffic": None, "checked_at": time.time()}
        nodes = []
        for nid in [n.strip() for n in settings.NODE_IDS.split(",") if n.strip()]:
            control = await self.redis.get(f"vakochat:node-control:{nid}")
            enabled = control != "disabled"
            raw = await self.redis.get(f"vakochat:node:{nid}")
            if raw:
                d = json.loads(raw)
                status = "disabled" if not enabled else "online"
                nodes.append({"node_id": nid, "status": status, "enabled": enabled, "port": d["port"], "connections": d["connections"],
                              "uptime_s": round(time.time() - d["started"], 1), "last_heartbeat": d["ts"]})
            else:  # key expired or never written -> not healthy
                status = "disabled" if not enabled else "offline"
                nodes.append({"node_id": nid, "status": status, "enabled": enabled, "port": None, "connections": None,
                              "uptime_s": None, "last_heartbeat": None})
        # real traffic: per-minute counters, last 30 minutes, all nodes summed
        now = minute_bucket()
        series = []
        for b in range(now - 29, now + 1):
            sent = delivered = 0
            for n in nodes:
                h = await self.redis.hgetall(f"vakochat:traffic:{n['node_id']}:{b}")
                sent += int(h.get("sent", 0))
                delivered += int(h.get("delivered", 0))
            series.append({"minute": b * 60, "sent": sent, "delivered": delivered})
        return {"redis": "connected", "nodes": nodes, "checked_at": time.time(),
                "traffic": {"window": "last 30 minutes, per minute", "series": series}}


hub = Hub()
