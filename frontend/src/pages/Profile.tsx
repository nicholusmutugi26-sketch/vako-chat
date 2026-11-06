import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Pencil, Save, Trash2, Users, X } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { Avatar, Panel } from "../components/ui";
import UserProfileDialog from "../components/UserProfileDialog";
import VerifiedBadge from "../components/VerifiedBadge";
import type { Member, VerificationStatus } from "../types";

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
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [socialList, setSocialList] = useState<"followers" | "following" | null>(null);
  const [socialUsers, setSocialUsers] = useState<Member[]>([]);
  const [socialBusy, setSocialBusy] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [verificationReason, setVerificationReason] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const refreshVerification = () => {
      void api.verificationStatus().then((status) => {
        if (!active) return;
        setVerification(status);
        if (status.is_verified && !user.is_verified) setUser({ ...user, is_verified: true });
      }).catch((error: unknown) => {
        if (active) setMsg(error instanceof Error ? error.message : "Verification status could not be loaded");
      });
    };
    void api.followCounts().then((counts) => { if (active) setFollowCounts(counts); })
      .catch((error: unknown) => { if (active) setSocialError(error instanceof Error ? error.message : "Follow details could not be loaded"); });
    refreshVerification();
    const interval = window.setInterval(refreshVerification, 15000);
    window.addEventListener("focus", refreshVerification);
    document.addEventListener("visibilitychange", refreshVerification);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVerification);
      document.removeEventListener("visibilitychange", refreshVerification);
    };
  }, [user, setUser]);

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

  async function showSocialList(kind: "followers" | "following") {
    setSocialList(kind);
    setSocialBusy(true);
    setSocialError(null);
    try {
      setSocialUsers(kind === "followers" ? await api.followers(user!.id) : await api.following(user!.id));
    } catch (error) {
      setSocialError(error instanceof Error ? error.message : "Follow list could not be loaded");
    } finally {
      setSocialBusy(false);
    }
  }

  async function applyForVerification(event: FormEvent) {
    event.preventDefault();
    setVerificationBusy(true);
    setMsg(null);
    try {
      setVerification(await api.applyForVerification(verificationReason.trim()));
      setVerificationReason("");
      setMsg("Verification application submitted for admin review");
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Verification application could not be submitted");
    } finally {
      setVerificationBusy(false);
    }
  }

  if (!user) return null;
  const isVerified = user.is_verified || verification?.is_verified === true;
  return (
    <div className="h-full min-h-0 overflow-y-auto px-1 pb-4 sm:px-2">
      <Panel className="min-h-full w-full overflow-hidden">
        <header className="relative flex flex-col gap-5 overflow-hidden border-b border-line bg-gradient-to-br from-amber/10 via-elevated/40 to-emerald-500/10 p-5 sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-amber/10 blur-3xl" />
          <div className="relative z-10 flex w-full items-center gap-3 sm:gap-5">
            <div className="relative w-fit shrink-0">
              <Avatar name={user.display_name} size={96} imageUrl={user.avatar_url} />
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
            <div className="flex min-w-0 flex-1 justify-end gap-2">
              <button type="button" onClick={() => void showSocialList("followers")}
                className="min-w-0 flex-1 rounded-xl border border-line bg-panel/70 px-2 py-3 text-center transition hover:bg-elevated sm:min-w-24 sm:flex-none sm:px-4">
                <span className="block text-xl font-semibold">{followCounts.followers}</span>
                <span className="text-xs text-dim">Followers</span>
              </button>
              <button type="button" onClick={() => void showSocialList("following")}
                className="min-w-0 flex-1 rounded-xl border border-line bg-panel/70 px-2 py-3 text-center transition hover:bg-elevated sm:min-w-24 sm:flex-none sm:px-4">
                <span className="block text-xl font-semibold">{followCounts.following}</span>
                <span className="text-xs text-dim">Following</span>
              </button>
            </div>
          </div>
          <div className="relative z-10 min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber">Your profile</p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 break-words text-2xl font-semibold sm:text-3xl">
              {user.display_name}{isVerified && <VerifiedBadge className="h-6 w-6" />}
            </h2>
            <p className="mt-1 text-sm text-dim">@{user.username}</p>
            <span className={`mt-3 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs ${conn === "connected" ? "text-ok" : "text-dim"}`}>
              <span className={`h-2 w-2 rounded-full ${conn === "connected" ? "bg-ok" : "bg-muted"}`} />
              {conn === "connected" ? "Connected" : "Not connected"}
            </span>
          </div>
          {avatarBusy && <p className="relative z-10 text-sm text-dim" role="status">Updating picture…</p>}
        </header>
        <div className="mx-auto grid w-full max-w-6xl gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-2xl border border-line bg-elevated/20 p-5 sm:p-6 lg:col-span-2">
            <h3 className="flex items-center gap-2 font-medium">Account verification{isVerified && <VerifiedBadge />}</h3>
            <p className="mt-1 text-sm text-dim">Apply for a verified badge. An administrator reviews each request.</p>
            {isVerified
              ? <p className="mt-3 text-sm text-ok">Your account is verified.</p>
              : verification?.application?.status === "pending"
                ? <p role="status" className="mt-3 rounded-lg border border-amber/25 bg-amber/5 p-3 text-sm text-amber">Your application is awaiting administrator review.</p>
                : <form onSubmit={(event) => void applyForVerification(event)} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="block text-sm">Why should your account be verified?
                    <textarea className="field mt-1 min-h-24" value={verificationReason} minLength={20} maxLength={500}
                      placeholder="Briefly explain your identity or public presence and why people should recognize this account."
                      onChange={(event) => setVerificationReason(event.target.value)} required />
                    <span className="mt-1 block text-right text-xs text-dim">{verificationReason.length}/500 · at least 20 characters</span>
                  </label>
                  <button type="submit" className="btn btn-primary w-full justify-center sm:w-auto"
                    disabled={verificationBusy || verificationReason.trim().length < 20}>
                    {verificationBusy ? "Submitting…" : verification?.application?.status === "denied" ? "Apply again" : "Apply for verification"}
                  </button>
                </form>}
          </section>
          <section className="h-fit rounded-2xl border border-line bg-elevated/20 p-5 sm:p-6">
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
          <form onSubmit={save} className="space-y-4 rounded-2xl border border-line bg-elevated/20 p-5 sm:p-6">
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
      {socialList && <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-3" role="dialog" aria-modal="true" aria-label={`Your ${socialList}`}>
        <Panel className="flex max-h-[min(80dvh,38rem)] w-full max-w-md flex-col overflow-hidden shadow-2xl">
          <header className="flex items-center gap-3 border-b border-line p-4">
            <Users size={19} className="text-amber" />
            <h2 className="flex-1 text-lg font-semibold capitalize">{socialList}</h2>
            <button type="button" className="btn btn-ghost !min-h-9 !px-2" aria-label="Close list" onClick={() => setSocialList(null)}><X size={18} /></button>
          </header>
          <div className="overflow-y-auto p-2">
            {socialBusy && <p className="p-5 text-center text-sm text-dim">Loading {socialList}…</p>}
            {!socialBusy && socialError && <p role="alert" className="p-5 text-center text-sm text-bad">{socialError}</p>}
            {!socialBusy && !socialError && socialUsers.length === 0 && <p className="p-5 text-center text-sm text-dim">No {socialList} yet.</p>}
            {socialUsers.map((member) => <button key={member.id} type="button" onClick={() => setProfileUserId(member.id)}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
              <Avatar name={member.display_name} imageUrl={member.avatar_url} size={42} />
              <div className="min-w-0 flex-1"><p className="flex items-center gap-1 truncate text-sm font-medium">{member.display_name}{member.is_verified && <VerifiedBadge className="h-[14px] w-[14px]" />}</p><p className="truncate text-xs text-dim">@{member.username}</p></div>
              <span className="text-xs text-dim">View profile</span>
            </button>)}
          </div>
        </Panel>
      </div>}
      {profileUserId && <UserProfileDialog userId={profileUserId} onClose={() => setProfileUserId(null)} />}
    </div>
  );
}
