import { useEffect, useState } from "react";
import { Database, Server } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Panel } from "../components/ui";
import type { ClusterStatus } from "../types";

const dur = (s: number | null) => (s === null ? "Unavailable" : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);
const Dot = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span className={`h-2 w-2 rounded-full ${ok ? "bg-ok" : warn ? "bg-warn" : "bg-bad"}`} />;

export default function Monitor() {
  const { nodeId } = useApp();
  const [s, setS] = useState<ClusterStatus | null>(null); const [err, setErr] = useState(false); const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => { try { const r = await api.cluster(); if (alive) { setS(r); setErr(false); setAt(Date.now()); } } catch { if (alive) setErr(true); } };
    void tick(); const t = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const series = s?.traffic?.series ?? [];
  const max = Math.max(1, ...series.map((p) => Math.max(p.sent, p.delivered)));
  const pts = (k: "sent" | "delivered") => series.map((p, i) => `${(i / Math.max(1, series.length - 1)) * 300},${90 - (p[k] / max) * 80}`).join(" ");
  const hasTraffic = series.some((p) => p.sent || p.delivered);

  return (
    <div className="space-y-3 overflow-y-auto h-full">
      <Panel className="p-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Network monitoring</h2>
          <span className="text-xs text-dim">{err ? "Monitoring endpoint unreachable" : at ? `Last check ${new Date(at).toLocaleTimeString()}` : "Loading…"}</span></div>
        <p className="text-xs text-dim mt-1">You are connected to: {nodeId ?? "Unavailable"}</p>
      </Panel>
      <div className="grid gap-3 md:grid-cols-3">
        {(s?.nodes ?? []).map((n) => (
          <Panel key={n.node_id} className="p-4 space-y-1">
            <div className="flex items-center gap-2"><Server size={18} className="text-amber" /><h3 className="font-medium">{n.node_id}</h3></div>
            <p className="flex items-center gap-2 text-sm"><Dot ok={n.status === "online"} />{n.status === "online" ? "Online" : "Offline"}</p>
            <p className="text-sm text-dim">Port: {n.port ?? "Unavailable"}</p>
            <p className="text-sm text-dim">Active connections: {n.connections ?? "Unavailable"}</p>
            <p className="text-sm text-dim">Uptime: {dur(n.uptime_s)}</p>
            <p className="text-xs text-muted">Heartbeat: {n.last_heartbeat ? new Date(n.last_heartbeat * 1000).toLocaleTimeString() : "none (expired)"}</p>
          </Panel>
        ))}
        <Panel className="p-4 space-y-1">
          <div className="flex items-center gap-2"><Database size={18} className="text-amber" /><h3 className="font-medium">Redis</h3></div>
          <p className="flex items-center gap-2 text-sm"><Dot ok={s?.redis === "connected"} />{s ? (s.redis === "connected" ? "Connected" : "Disconnected") : "Unavailable"}</p>
          <p className="text-sm text-dim">Channel: vakochat:events</p>
          <p className="text-xs text-muted">Answered by {s?.answered_by ?? "Unavailable"}</p>
        </Panel>
      </div>
      <Panel className="p-4">
        <h3 className="font-medium mb-1">Message traffic</h3>
        <p className="text-xs text-dim mb-2">{s?.traffic?.window ?? "Unavailable"} · sent = accepted by nodes, delivered = frames written to local sockets</p>
        {!s?.traffic ? <p className="text-sm text-muted">Unavailable</p> : !hasTraffic ? <p className="text-sm text-muted">No traffic recorded in this window</p> : (
          <svg viewBox="0 0 300 100" className="w-full h-40" role="img" aria-label="Message traffic per minute, last 30 minutes">
            <line x1="0" y1="90" x2="300" y2="90" stroke="#292929" />
            <polyline points={pts("sent")} fill="none" stroke="#D9A51F" strokeWidth="1.5" />
            <polyline points={pts("delivered")} fill="none" stroke="#A7A39A" strokeWidth="1.5" strokeDasharray="3 2" />
            <text x="2" y="10" fontSize="7" fill="#A7A39A">max {max}/min</text>
          </svg>
        )}
        <p className="text-xs text-dim">Solid amber: sent · Dashed grey: delivered</p>
      </Panel>
    </div>
  );
}
