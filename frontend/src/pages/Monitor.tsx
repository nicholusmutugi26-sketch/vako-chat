import { useCallback, useEffect, useState } from "react";
import { Activity, Ban, Database, MessageSquare, Search, Server, Shield, Users } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Panel } from "../components/ui";
import type { AdminAuditEvent, AdminOverview, AdminUser, ClusterStatus } from "../types";

const dur = (s: number | null) => (s === null ? "Unavailable" : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${(s / 3600).toFixed(1)}h`);
const Dot = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span className={`h-2 w-2 rounded-full ${ok ? "bg-ok" : warn ? "bg-warn" : "bg-bad"}`} />;
const Metric = ({ label, value, Icon }: { label: string; value: number | null; Icon: typeof Users }) => (
  <Panel className="flex items-center gap-3 p-4">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-elevated text-amber"><Icon size={20} /></span>
    <div><p className="text-xs text-dim">{label}</p><p className="text-xl font-semibold">{value ?? "—"}</p></div>
  </Panel>
);

export default function Monitor() {
  const { nodeId, user: currentUser } = useApp();
  const [s, setS] = useState<ClusterStatus | null>(null);
  const [err, setErr] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const [busyNode, setBusyNode] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [query, setQuery] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const refreshAdmin = useCallback(async () => {
    try {
      const [summary, userList, events] = await Promise.all([
        api.adminOverview(), api.adminUsers(query), api.adminAudit(),
      ]);
      setOverview(summary);
      setUsers(userList);
      setAudit(events);
      setAdminError(null);
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : "Admin data could not be loaded");
    }
  }, [query]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.cluster();
        if (alive) { setS(r); setErr(false); setAt(Date.now()); }
      } catch {
        if (alive) setErr(true);
      }
    };
    void tick();
    const timer = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    void refreshAdmin();
    const timer = setInterval(() => { void refreshAdmin(); }, 15000);
    return () => clearInterval(timer);
  }, [refreshAdmin]);

  const series = s?.traffic?.series ?? [];
  const max = Math.max(1, ...series.map((p) => Math.max(p.sent, p.delivered)));
  const pts = (k: "sent" | "delivered") => series.map((p, i) => `${(i / Math.max(1, series.length - 1)) * 300},${90 - (p[k] / max) * 80}`).join(" ");
  const hasTraffic = series.some((p) => p.sent || p.delivered);

  async function toggleNode(id: string, enabled: boolean) {
    setBusyNode(id); setActionError(null);
    try {
      await api.setNodeEnabled(id, enabled);
      const result = await api.cluster();
      setS(result); setAt(Date.now());
      await refreshAdmin();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Node state could not be changed");
    } finally { setBusyNode(null); }
  }

  async function changeUser(user: AdminUser, action: "admin" | "suspended") {
    setBusyUser(user.id); setAdminError(null);
    try {
      if (action === "admin") await api.setUserAdmin(user.id, !user.is_admin);
      else await api.setUserSuspended(user.id, !user.is_suspended);
      await refreshAdmin();
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : "Account update failed");
    } finally { setBusyUser(null); }
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto pb-5">
      <Panel className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Admin dashboard</h2><p className="mt-1 text-xs text-dim">Manage accounts, review activity, and monitor the chat cluster.</p></div>
          <span className="text-xs text-dim">{err ? "Monitoring endpoint unreachable" : at ? `Last health check ${new Date(at).toLocaleTimeString()}` : "Loading health…"}</span>
        </div>
        <p className="mt-2 text-xs text-dim">Connected node: {nodeId ?? "Unavailable"}</p>
        {actionError && <p className="mt-2 text-sm text-bad" role="alert">{actionError}</p>}
        {adminError && <p className="mt-2 text-sm text-bad" role="alert">{adminError}</p>}
      </Panel>

      <section aria-label="Platform overview" className="grid gap-3 grid-cols-2 xl:grid-cols-5">
        <Metric label="Registered users" value={overview?.users ?? null} Icon={Users} />
        <Metric label="Active admins" value={overview?.admins ?? null} Icon={Shield} />
        <Metric label="Groups" value={overview?.groups ?? null} Icon={Activity} />
        <Metric label="Messages" value={overview?.messages ?? null} Icon={MessageSquare} />
        <Metric label="Suspended accounts" value={overview?.suspended ?? null} Icon={Ban} />
      </section>

      <section aria-label="Cluster health">
        <h3 className="mb-2 font-semibold">Cluster health</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(s?.nodes ?? []).map((n) => (
            <Panel key={n.node_id} className="space-y-1 p-4">
              <div className="flex items-center gap-2"><Server size={18} className="text-amber" /><h4 className="font-medium">{n.node_id}</h4></div>
              <p className="flex items-center gap-2 text-sm"><Dot ok={n.status === "online"} warn={n.status === "disabled"} />{n.status === "online" ? "Online" : n.status === "disabled" ? "Disabled" : "Offline"}</p>
              <p className="text-sm text-dim">Port: {n.port ?? "Unavailable"} · Connections: {n.connections ?? "Unavailable"}</p>
              <p className="text-sm text-dim">Uptime: {dur(n.uptime_s)}</p>
              <p className="text-xs text-muted">Heartbeat: {n.last_heartbeat ? new Date(n.last_heartbeat * 1000).toLocaleTimeString() : "none (expired)"}</p>
              <button className={`btn mt-2 w-full ${n.enabled ? "btn-ghost" : "btn-primary"}`} disabled={busyNode === n.node_id}
                onClick={() => void toggleNode(n.node_id, !n.enabled)}>
                {busyNode === n.node_id ? "Updating…" : n.enabled ? "Turn node off" : "Turn node on"}
              </button>
            </Panel>
          ))}
          <Panel className="space-y-1 p-4">
            <div className="flex items-center gap-2"><Database size={18} className="text-amber" /><h4 className="font-medium">Redis</h4></div>
            <p className="flex items-center gap-2 text-sm"><Dot ok={s?.redis === "connected"} />{s ? (s.redis === "connected" ? "Connected" : "Disconnected") : "Unavailable"}</p>
            <p className="text-sm text-dim">Channel: vakochat:events</p>
            <p className="text-xs text-muted">Answered by {s?.answered_by ?? "Unavailable"}</p>
          </Panel>
        </div>
      </section>

      <Panel className="p-4">
        <h3 className="font-semibold">Message traffic</h3>
        <p className="mb-2 mt-1 text-xs text-dim">{s?.traffic?.window ?? "Unavailable"} · sent = accepted by nodes, delivered = frames written to local sockets</p>
        {!s?.traffic ? <p className="text-sm text-muted">Unavailable</p> : !hasTraffic ? <p className="text-sm text-muted">No traffic recorded in this window</p> : (
          <svg viewBox="0 0 300 100" className="h-40 w-full" role="img" aria-label="Message traffic per minute, last 30 minutes">
            <line x1="0" y1="90" x2="300" y2="90" stroke="var(--color-line)" />
            <polyline points={pts("sent")} fill="none" stroke="var(--color-amber)" strokeWidth="1.5" />
            <polyline points={pts("delivered")} fill="none" stroke="var(--color-dim)" strokeWidth="1.5" strokeDasharray="3 2" />
            <text x="2" y="10" fontSize="7" fill="var(--color-dim)">max {max}/min</text>
          </svg>
        )}
        <p className="text-xs text-dim">Solid accent: sent · Dashed secondary: delivered</p>
      </Panel>

      <Panel className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">User management</h3><p className="text-xs text-dim">Search users, grant administrator access, or suspend and restore accounts.</p></div>
          <label className="relative w-full sm:w-72">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search users" aria-label="Search users" />
          </label>
        </div>
        {users.length === 0 ? <p className="py-5 text-center text-sm text-muted">No users found.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs text-dim"><tr>
                <th className="px-2 py-2 font-medium">User</th><th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Role</th><th className="px-2 py-2 font-medium">Joined</th>
                <th className="px-2 py-2 font-medium">Actions</th>
              </tr></thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-3"><p className="font-medium">{item.display_name}</p><p className="text-xs text-dim">@{item.username}{item.email ? ` · ${item.email}` : ""}</p></td>
                    <td className="px-2 py-3">{item.is_suspended ? <span className="text-bad">Suspended</span> : <span className="text-ok">Active</span>}</td>
                    <td className="px-2 py-3">{item.is_admin ? "Admin" : "User"}{item.managed_by_config ? " · config" : ""}</td>
                    <td className="px-2 py-3 text-xs text-dim">{new Date(item.created_at * 1000).toLocaleDateString()}</td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="btn btn-ghost min-h-9 px-3 text-xs" disabled={busyUser === item.id || item.managed_by_config || item.id === currentUser?.id}
                          onClick={() => void changeUser(item, "admin")}>
                          {item.is_admin ? "Remove admin" : "Make admin"}
                        </button>
                        <button className={`btn min-h-9 px-3 text-xs ${item.is_suspended ? "btn-primary" : "btn-ghost"}`}
                          disabled={busyUser === item.id || item.id === currentUser?.id}
                          onClick={() => void changeUser(item, "suspended")}>
                          {item.is_suspended ? "Restore" : "Suspend"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="p-4">
        <div className="mb-3"><h3 className="font-semibold">Admin and account activity</h3><p className="text-xs text-dim">Recent sign-ins, registrations, account controls, and node changes.</p></div>
        {audit.length === 0 ? <p className="py-4 text-sm text-muted">No activity recorded yet.</p> : (
          <ol className="space-y-3">
            {audit.map((event) => (
              <li key={event.id} className="flex gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-elevated text-amber"><Activity size={15} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-medium">{event.actor_name ?? event.actor_username ?? "System"}</span>{" "}{event.action.replace(/[._]/g, " ")}</p>
                  <p className="text-xs text-dim">{event.target_name ?? event.target_username ?? event.details ?? "—"} · {new Date(event.created_at * 1000).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
