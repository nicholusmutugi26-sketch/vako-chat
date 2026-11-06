import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Avatar } from "./ui";
import type { Member } from "../types";

export default function NewConversation({ onClose, allowGroups = true }: { onClose: () => void; allowGroups?: boolean }) {
  const { openDirect, createGroup } = useApp();
  const [users, setUsers] = useState<Member[]>([]); const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<File | undefined>();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.users().then(setUsers).catch(() => setErr("Could not load users")); }, []);
  useEffect(() => {
    if (!avatar) { setAvatarPreview(null); return; }
    const url = URL.createObjectURL(avatar);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatar]);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  async function go() {
    setBusy(true);
    setErr(null);
    try {
      if (!allowGroups && picked.length === 1) await openDirect(picked[0]);
      else if (picked.length === 1 && !title) await openDirect(picked[0]);
      else if (title && picked.length) await createGroup(title, picked, description.trim(), avatar);
      else return setErr(allowGroups
        ? "Pick one user for a direct chat, or add a title and members for a group"
        : "Choose one person to start a direct conversation");
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="New conversation" className="fixed inset-0 bg-canvas/90 grid place-items-center p-4 z-50">
      <div className="bg-panel border border-line rounded-lg w-full max-w-md max-h-[90dvh] overflow-y-auto p-4 space-y-3">
        <h2 className="font-semibold">New conversation</h2>
        {allowGroups && <input className="field" placeholder="Group title (leave empty for direct message)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} />}
        {allowGroups && title.trim() && <>
          <label className="block text-sm">Group description
            <textarea className="field mt-1 min-h-20" placeholder="What is this group for?" value={description}
              onChange={(e) => setDescription(e.target.value)} maxLength={500} />
            <span className="mt-1 block text-right text-xs text-dim">{description.length}/500</span>
          </label>
          <div className="flex items-center gap-3 rounded-md border border-line bg-elevated/30 p-3">
            <Avatar name={title || "Group"} kind="group" size={48} imageUrl={avatarPreview} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Group picture</p>
              <p className="truncate text-xs text-dim">{avatar?.name ?? "Optional · large images are resized automatically"}</p>
            </div>
            <label className="btn btn-ghost !px-3 cursor-pointer" aria-label="Choose group picture">
              <ImagePlus size={16} />Choose
              <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                    setErr("Choose a PNG, JPEG, or WebP group picture");
                    return;
                  }
                  if (file.size > 25 * 1024 * 1024) {
                    setErr("Choose a group picture smaller than 25 MB");
                    return;
                  }
                  setErr(null);
                  setAvatar(file);
                }} />
            </label>
            {avatar && <button className="btn btn-ghost !px-2" aria-label="Remove selected group picture" onClick={() => setAvatar(undefined)}>
              <X size={16} />
            </button>}
          </div>
        </>}
        <ul className="max-h-60 overflow-y-auto border border-line rounded-md">
          {users.length === 0 && <li className="p-3 text-sm text-muted">No other users registered yet</li>}
          {users.map((u) => (
            <li key={u.id}><label className="flex items-center gap-3 p-3 min-h-[44px] hover:bg-elevated cursor-pointer">
              <input type={allowGroups ? "checkbox" : "radio"} name={allowGroups ? undefined : "direct-recipient"} checked={picked.includes(u.id)} onChange={() => allowGroups ? toggle(u.id) : setPicked([u.id])} className="accent-amber" />
              <Avatar name={u.display_name} size={32} imageUrl={u.avatar_url} />
              <span>{u.display_name} <span className="text-muted text-sm">@{u.username}</span></span></label></li>
          ))}
        </ul>
        {err && <p role="alert" className="text-sm text-bad">{err}</p>}
        <div className="flex gap-2 justify-end"><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" onClick={() => void go()} disabled={busy}>{busy ? "Creating…" : allowGroups ? "Create" : "Start chat"}</button></div>
      </div>
    </div>
  );
}
