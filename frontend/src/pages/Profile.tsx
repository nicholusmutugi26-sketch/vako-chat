import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Pencil, Save, Trash2 } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Avatar, Panel } from "../components/ui";

export default function Profile() {
  const { user, setUser, conn } = useApp();
  const [name, setName] = useState(user?.display_name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(() => {
    const digits = (user?.phone ?? "").replace(/\D/g, "");
    return digits.startsWith("254") ? digits.slice(3).slice(-9) : digits.slice(-9);
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.display_name ?? "");
    setBio(user?.bio ?? "");
    setEmail(user?.email ?? "");
    const digits = (user?.phone ?? "").replace(/\D/g, "");
    setPhone(digits.startsWith("254") ? digits.slice(3).slice(-9) : digits.slice(-9));
  }, [user?.display_name, user?.bio, user?.email, user?.phone]);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const updated = await api.updateMe(name, bio, email.trim(), phone ? `+254${phone}` : null);
      setUser(updated);
      setDirty(false);
      setMsg("Profile saved");
    } catch (x) {
      setMsg(x instanceof Error ? x.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMsg("Choose a PNG, JPEG, or WebP image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMsg("Profile pictures must be 2 MB or smaller");
      return;
    }
    setAvatarBusy(true); setMsg(null);
    try {
      setUser(await api.uploadAvatar(file));
      setMsg("Profile picture updated");
    } catch (x) {
      setMsg(x instanceof Error ? x.message : "Profile picture upload failed");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true); setMsg(null);
    try {
      setUser(await api.deleteAvatar());
      setMsg("Profile picture removed");
    } catch (x) {
      setMsg(x instanceof Error ? x.message : "Profile picture could not be removed");
    } finally {
      setAvatarBusy(false);
    }
  }

  if (!user) return null;
  return (
    <div className="h-full min-h-0 overflow-y-auto px-1 pb-4 sm:px-2">
      <Panel className="min-h-full w-full overflow-hidden">
        <header className="flex flex-col gap-4 border-b border-line bg-elevated/40 p-4 sm:flex-row sm:items-center sm:p-6">
          <div className="relative w-fit">
            <Avatar name={user.display_name} size={76} imageUrl={user.avatar_url} />
            <button type="button" className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-line bg-elevated text-ink hover:bg-line"
              aria-label="Edit profile picture" aria-expanded={avatarMenuOpen} disabled={avatarBusy}
              onClick={() => setAvatarMenuOpen((open) => !open)}><Pencil size={15} /></button>
            {avatarMenuOpen && <div className="absolute left-14 top-14 z-20 min-w-40 rounded-md border border-line bg-sidebar p-1 shadow-xl">
              <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-elevated"
                onClick={() => { setAvatarMenuOpen(false); avatarInput.current?.click(); }}>
                <ImagePlus size={15} />{user.avatar_url ? "Change picture" : "Upload picture"}
              </button>
              {user.avatar_url && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-bad hover:bg-elevated"
                onClick={() => { setAvatarMenuOpen(false); void removeAvatar(); }}>
                <Trash2 size={15} />Delete picture
              </button>}
            </div>}
            <input ref={avatarInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" disabled={avatarBusy}
              onChange={(e) => { void uploadAvatar(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber">Your profile</p>
            <h2 className="mt-1 break-words text-xl font-semibold">{user.display_name}</h2>
            <p className="mt-1 text-sm text-dim">@{user.username}</p>
            <span className={`mt-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs ${conn === "connected" ? "text-ok" : "text-dim"}`}>
              <span className={`h-2 w-2 rounded-full ${conn === "connected" ? "bg-ok" : "bg-muted"}`} />
              {conn === "connected" ? "Connected" : "Not connected"}
            </span>
          </div>
          {avatarBusy && <p className="text-sm text-dim" role="status">Updating picture…</p>}
        </header>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="h-fit rounded-lg border border-line bg-elevated/20 p-4 sm:p-5">
            <h3 className="font-medium">Profile details</h3>
            <p className="mb-4 mt-1 text-sm text-dim">Your saved contact and profile information.</p>
            <dl className="divide-y divide-line">
              <div className="py-3"><dt className="text-xs text-muted">Username</dt><dd className="mt-1 break-all text-sm">@{user.username}</dd></div>
              <div className="py-3"><dt className="text-xs text-muted">Email</dt><dd className="mt-1 break-all text-sm">{user.email || "Not added yet"}</dd></div>
              <div className="py-3"><dt className="text-xs text-muted">Phone</dt><dd className="mt-1 text-sm">{user.phone || "Not added yet"}</dd></div>
              <div className="py-3"><dt className="text-xs text-muted">Bio</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{user.bio || "No bio yet"}</dd></div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-xs text-dim">Profile pictures: PNG, JPEG, or WebP · max 2 MB</p>
          </section>
          <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-elevated/20 p-4 sm:p-5">
            <div>
              <h3 className="font-medium">Edit profile</h3>
              <p className="mt-1 text-sm text-dim">Update the details shown to your contacts.</p>
            </div>
            <label className="block text-sm">Display name
              <input className="field mt-1" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} required maxLength={48} />
            </label>
            <label className="block text-sm">Email
              <input className="field mt-1" type="email" autoComplete="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setDirty(true); }} maxLength={254} />
            </label>
            <label className="block text-sm">Phone number
              <span className="mt-1 flex min-h-[44px] overflow-hidden rounded-md border border-line bg-elevated focus-within:outline focus-within:outline-2 focus-within:outline-amber">
                <span className="grid place-items-center border-r border-line px-3 text-dim" aria-hidden="true">+254</span>
                <input className="min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-muted"
                  type="tel" inputMode="numeric" autoComplete="tel-national" aria-label="Phone number after +254"
                  placeholder="712345678" value={phone} maxLength={9} pattern="[0-9]{9}"
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 9)); setDirty(true); }} />
              </span>
              <span className="mt-1 block text-xs text-dim">Nine digits after +254. Leave blank to remove.</span>
            </label>
            <label className="block text-sm">Bio
              <textarea className="field mt-1 min-h-[100px]" value={bio} onChange={(e) => { setBio(e.target.value); setDirty(true); }} maxLength={200} />
              <span className="mt-1 block text-right text-xs text-dim">{bio.length}/200</span>
            </label>
            {msg && <p role="status" className="text-sm text-dim">{msg}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" className="btn btn-ghost w-full sm:w-auto" disabled={!dirty || busy}
                onClick={() => {
                  setName(user.display_name);
                  setBio(user.bio);
                  setEmail(user.email ?? "");
                  const digits = (user.phone ?? "").replace(/\D/g, "");
                  setPhone(digits.startsWith("254") ? digits.slice(3).slice(-9) : digits.slice(-9));
                  setDirty(false);
                  setMsg(null);
                }}>Discard changes</button>
              <button className="btn btn-primary w-full sm:w-auto" disabled={busy || !dirty}><Save size={16} />{busy ? "Saving…" : "Save profile"}</button>
            </div>
          </form>
        </div>
      </Panel>
    </div>
  );
}
