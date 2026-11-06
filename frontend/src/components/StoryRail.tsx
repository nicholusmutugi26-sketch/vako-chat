import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Avatar } from "./ui";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import VerifiedBadge from "./VerifiedBadge";
import type { StoryGroup } from "../types";

export default function StoryRail({ onOpen }: { onOpen: (userId?: string) => void }) {
  const { user } = useApp();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await api.stories();
        if (active) {
          setGroups(result);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Stories could not be loaded");
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const ownStories = groups.find((group) => group.user.id === user?.id);
  const others = groups.filter((group) => group !== ownStories);
  const sorted = [...others].sort((a, b) => Number(b.has_unviewed) - Number(a.has_unviewed));
  return (
    <section className="border-b border-line px-3 py-2" aria-label="Stories">
      <div className="ml-1 flex items-start gap-3 overflow-x-auto pb-1">
        <button type="button" onClick={() => onOpen(ownStories?.user.id)} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center text-xs text-dim">
          <span className="relative">
            <span className={`grid h-[60px] w-[60px] place-items-center rounded-full p-[3px] ${ownStories ? "bg-muted" : "border-2 border-dashed border-line"}`}>
              <span className="grid h-full w-full place-items-center rounded-full bg-panel">
                {ownStories
                  ? <Avatar name={ownStories.user.display_name} imageUrl={ownStories.user.avatar_url} size={48} />
                  : <Plus size={22} className="text-amber" />}
              </span>
            </span>
            {ownStories && <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-panel bg-amber text-canvas"><Plus size={12} /></span>}
          </span>
          <span className="flex max-w-full items-center gap-1 truncate">{ownStories?.user.is_verified && <VerifiedBadge className="h-3 w-3" />}Your story</span>
        </button>
        {sorted.map((group) => (
          <button key={group.user.id} type="button" onClick={() => onOpen(group.user.id)}
            aria-label={`${group.user.display_name}'s ${group.has_unviewed ? "new story" : "story"}`}
            className="flex w-16 shrink-0 flex-col items-center gap-1 text-center text-xs text-dim">
            <span className={`grid h-[60px] w-[60px] place-items-center rounded-full p-[3px] ${group.has_unviewed ? "bg-emerald-500" : "bg-muted"}`}>
              <span className="grid h-full w-full place-items-center rounded-full bg-panel">
                <Avatar name={group.user.display_name} imageUrl={group.user.avatar_url} size={48} />
              </span>
            </span>
            <span className="flex max-w-full items-center gap-1"><span className="truncate">{group.user.display_name}</span>{group.user.is_verified && <VerifiedBadge className="h-3 w-3" />}</span>
          </button>
        ))}
        {error && <p role="alert" className="self-center text-xs text-bad">{error}</p>}
        {!error && groups.length === 0 && <p className="self-center text-xs text-muted">Share a story or see updates here.</p>}
      </div>
    </section>
  );
}
