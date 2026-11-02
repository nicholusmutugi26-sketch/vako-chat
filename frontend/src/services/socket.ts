import { WS_NODE_URLS } from "../config/env";
import type { ConnState, ServerFrame } from "../types";

const BASE_MS = 1000, MAX_MS = 15000, FAILS_BEFORE_SWITCH = 2, STABLE_MS = 8000, PING_MS = 15000, PONG_TIMEOUT_MS = 8000;

export interface SocketHandlers {
  onState(s: ConnState, nodeIndex: number | null): void;
  onFrame(f: ServerFrame): void;
  onAuthFailed(): void;
}

/** One reconnect loop only. Capped exponential backoff + jitter; switches node after repeated failures. */
export class FailoverSocket {
  private ws: WebSocket | null = null;
  private idx = 0;
  private fails = 0;
  private timer: number | null = null;
  private stableTimer: number | null = null;
  private pingTimer: number | null = null;
  private pongTimer: number | null = null;
  private stopped = true;

  constructor(private token: string, private h: SocketHandlers, private urls = WS_NODE_URLS) {}

  start() { this.stopped = false; this.connect(); }

  stop() {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) { this.ws.onclose = null; this.ws.onerror = null; this.ws.close(); this.ws = null; }
    this.h.onState("disconnected", null);
  }

  send(obj: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  private clearTimers() {
    for (const t of [this.timer, this.stableTimer, this.pingTimer, this.pongTimer]) if (t) clearTimeout(t);
    this.timer = this.stableTimer = this.pingTimer = this.pongTimer = null;
  }

  private connect() {
    if (this.stopped) return;
    const idx = this.idx;
    const ws = new WebSocket(this.urls[idx]);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: this.token }));
    ws.onmessage = (ev) => {
      let f: ServerFrame;
      try { f = JSON.parse(ev.data) as ServerFrame; } catch { return; }
      if (f.type === "auth.ok") {
        this.h.onState("connected", idx);
        this.stableTimer = window.setTimeout(() => { this.fails = 0; }, STABLE_MS); // reset only after a stable period
        this.schedulePing();
      } else if (f.type === "error" && f.code === "auth_failed") {
        this.stopped = true; this.h.onAuthFailed(); return;
      } else if (f.type === "pong" && this.pongTimer) {
        clearTimeout(this.pongTimer); this.pongTimer = null;
      }
      this.h.onFrame(f);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.stopped) return;
      this.fails += 1;
      if (this.fails >= FAILS_BEFORE_SWITCH && this.urls.length > 1) {
        this.idx = (this.idx + 1) % this.urls.length;
        this.fails = 0;
      }
      this.h.onState("reconnecting", null);
      const delay = Math.min(MAX_MS, BASE_MS * 2 ** Math.min(this.fails, 5)) * (0.5 + Math.random() * 0.5);
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private schedulePing() {
    this.pingTimer = window.setTimeout(() => {
      if (!this.send({ type: "ping" })) return;
      this.pongTimer = window.setTimeout(() => this.ws?.close(), PONG_TIMEOUT_MS); // dead connection -> reconnect
      this.schedulePing();
    }, PING_MS);
  }
}
