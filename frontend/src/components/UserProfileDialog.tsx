import { useEffect, useState } from "react";
import { UserCheck, UserPlus, Users, X } from "lucide-react";
import { Avatar, Panel } from "./ui";
import VerifiedBadge from "./VerifiedBadge";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import type { PublicProfile } from "../types";

export default function UserProfileDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { user } = useApp();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setProfile(null);
    setError(null);
    void api.userProfile(userId).then((result) => {
      if (active) setProfile(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Profile could not be loaded");
    });
    return () => { active = false; };
  }, [userId]);

  async function toggleFollow() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const result = profile.is_following
        ? await api.unfollowUser(profile.id)
        : await api.followUser(profile.id);
      setProfile({ ...profile, is_following: result.is_following, follower_count: result.followers, following_count: result.following });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Follow status could not be updated");
    } finally {
      setBusy(false);
    }
  }

  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-3" role="dialog" aria-modal="true" aria-label="User profile">
    <Panel className="w-full max-w-sm overflow-hidden shadow-2xl">
      <header className="flex items-center border-b border-line p-3">
        <span className="flex-1 text-sm font-semibold">Profile</span>
        <button type="button" className="btn btn-ghost !min-h-10 !px-2" aria-label="Close profile" onClick={onClose}><X size={19} /></button>
      </header>
      {error && !profile
        ? <p role="alert" className="p-6 text-center text-sm text-bad">{error}</p>
        : profile ? <div className="p-5">
          <div className="flex items-center gap-4">
            <Avatar name={profile.display_name} imageUrl={profile.avatar_url} size={72} />
            <div className="min-w-0">
              <h2 className="flex items-center gap-1 truncate text-lg font-semibold">{profile.display_name}{profile.is_verified && <VerifiedBadge />}</h2>
              <p className="truncate text-sm text-dim">@{profile.username}</p>
            </div>
          </div>
          {profile.bio && <p className="mt-4 whitespace-pre-wrap break-words text-sm">{profile.bio}</p>}
          <div className="mt-4 flex gap-5 text-sm">
            <span><strong>{profile.follower_count}</strong> <span className="text-dim">followers</span></span>
            <span><strong>{profile.following_count}</strong> <span className="text-dim">following</span></span>
          </div>
          {profile.id !== user?.id && <button type="button" className={`btn mt-5 w-full justify-center ${profile.is_following ? "btn-ghost" : "btn-primary"}`}
            disabled={busy} onClick={() => void toggleFollow()}>
            {profile.is_following ? <UserCheck size={17} /> : <UserPlus size={17} />}
            {busy ? "Updating…" : profile.is_following ? "Following" : "Follow"}
          </button>}
          {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
        </div>
        : <div className="grid min-h-40 place-items-center text-sm text-dim"><Users size={20} className="animate-pulse" />Loading profile…</div>}
    </Panel>
  </div>;
}
