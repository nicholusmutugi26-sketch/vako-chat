import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle, UserRound, UsersRound } from "lucide-react";
import type { ConnState } from "../types";
import { APP_NAME } from "../config/brand";
import { API_BASES } from "../config/env";

export const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export function Avatar({ name, size = 40, imageUrl, kind = "user" }: {
  name: string; size?: number; imageUrl?: string | null; kind?: "user" | "group";
}) {
  const [baseIndex, setBaseIndex] = useState(0);
  useEffect(() => setBaseIndex(0), [imageUrl]);
  const src = imageUrl && baseIndex < API_BASES.length
    ? `${API_BASES[baseIndex]}${imageUrl}`
    : undefined;
  return (
    <div aria-hidden="true" className="shrink-0 overflow-hidden rounded-full bg-elevated border border-line text-amber font-semibold grid place-items-center"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover"
        onError={() => setBaseIndex((index) => Math.min(index + 1, API_BASES.length))} />
        : kind === "group" ? <UsersRound size={size * 0.52} strokeWidth={1.8} /> : <UserRound size={size * 0.52} strokeWidth={1.8} />}
    </div>
  );
}

export function BrandWordmark({ className = "" }: { className?: string }) {
  return (
    <span role="img" aria-label={APP_NAME}
      className={`inline-flex items-center whitespace-nowrap text-amber ${className}`}
      style={{ fontFamily: '"Orbitron", "Arial", sans-serif', letterSpacing: "0.025em", fontWeight: 700 }}>
      {APP_NAME.toLocaleLowerCase() === "vakochat" ? <>
        <span>V</span>
        <MessageCircle aria-hidden="true" className="mx-[0.03em] inline-block h-[0.68em] w-[0.68em] shrink-0 fill-current stroke-[1.8] text-amber" />
        <span className="sr-only">a</span>
        <span>kochat</span>
      </> : APP_NAME}
    </span>
  );
}

const connStyle: Record<ConnState, { c: string; t: string }> = {
  connected: { c: "bg-ok", t: "Connected" }, reconnecting: { c: "bg-warn", t: "Reconnecting" }, disconnected: { c: "bg-bad", t: "Disconnected" },
};
export function ConnectionBadge({ state }: { state: ConnState }) {
  const s = connStyle[state];
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-dim border border-line rounded-full px-3 py-1">
      <span className={`h-2 w-2 rounded-full ${s.c}`} />{s.t}
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
