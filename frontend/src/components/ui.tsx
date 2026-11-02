import type { ReactNode } from "react";
import type { ConnState } from "../types";

export const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div aria-hidden className="shrink-0 rounded-full bg-elevated border border-line text-amber font-semibold grid place-items-center"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name) || "?"}</div>
  );
}

const connStyle: Record<ConnState, { c: string; t: string }> = {
  connected: { c: "bg-ok", t: "Connected" }, reconnecting: { c: "bg-warn", t: "Reconnecting" }, disconnected: { c: "bg-bad", t: "Disconnected" },
};
export function ConnectionBadge({ state, node }: { state: ConnState; node: string | null }) {
  const s = connStyle[state];
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-dim border border-line rounded-full px-3 py-1">
      <span className={`h-2 w-2 rounded-full ${s.c}`} />{s.t}{node ? ` · ${node}` : ""}
    </span>
  );
}

export function Presence({ online, available }: { online: boolean; available: boolean }) {
  if (!available) return <span className="text-xs text-muted">Unavailable</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-dim">
      <span className={`h-2 w-2 rounded-full ${online ? "bg-ok" : "bg-muted"}`} />{online ? "Online" : "Offline"}
    </span>
  );
}

export const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) =>
  <section className={`bg-panel border border-line rounded-lg ${className}`}>{children}</section>;

export const EmptyState = ({ text }: { text: string }) => <p className="p-6 text-center text-sm text-muted">{text}</p>;
