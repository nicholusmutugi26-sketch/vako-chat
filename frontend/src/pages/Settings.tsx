import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Panel } from "../components/ui";
import { WS_NODE_URLS } from "../config/env";

/** Preferences are stored in-memory/localStorage only (non-sensitive). Server-side prefs are a TODO. */
export default function Settings() {
  const { logout } = useApp();
  const [notify, setNotify] = useState(() => localStorage.getItem("vk_notify") !== "off");
  return (
    <Panel className="p-4 max-w-xl space-y-4">
      <h2 className="font-semibold">Settings</h2>
      <section><h3 className="text-sm font-medium mb-1">Notifications</h3>
        <label className="flex items-center gap-3 min-h-[44px]"><input type="checkbox" className="accent-[#D9A51F]" checked={notify}
          onChange={(e) => { setNotify(e.target.checked); localStorage.setItem("vk_notify", e.target.checked ? "on" : "off"); }} />Show unread counts</label></section>
      <section><h3 className="text-sm font-medium mb-1">Appearance</h3><p className="text-sm text-dim">Dark graphite/amber theme (fixed by design spec).</p></section>
      <section><h3 className="text-sm font-medium mb-1">Privacy &amp; security</h3>
        <p className="text-sm text-dim">Session token is kept in sessionStorage and cleared when the tab closes. Passwords are hashed with bcrypt.</p></section>
      <section><h3 className="text-sm font-medium mb-1">About</h3><p className="text-sm text-dim">Configured nodes: {WS_NODE_URLS.join(", ")}</p></section>
      <button className="btn btn-ghost" onClick={logout}>Sign out</button>
    </Panel>
  );
}
