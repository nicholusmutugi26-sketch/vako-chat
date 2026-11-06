import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Eye, ImagePlus, Pause, Play, Plus, Send, Trash2, X } from "lucide-react";
import { Avatar, Panel } from "../components/ui";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import VerifiedBadge from "../components/VerifiedBadge";
import { prepareGroupImage } from "../utils/groupImage";
import type { StoryGroup, StoryItem, StoryViews } from "../types";

const storyTime = (timestamp: number) => new Date(timestamp * 1000).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
const expiresIn = (timestamp: number) => {
  const remainingMinutes = Math.max(0, Math.ceil((timestamp + 24 * 60 * 60 - Date.now() / 1000) / 60));
  return remainingMinutes >= 60 ? `expires in ${Math.ceil(remainingMinutes / 60)}h` : `expires in ${remainingMinutes}m`;
};

export default function Stories({ initialUserId, onReply }: {
  initialUserId?: string; onReply: (userId: string, text: string) => Promise<void>;
}) {
  const { user } = useApp();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [audience, setAudience] = useState<"all" | "messages" | "followers" | "both">("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [storyPaused, setStoryPaused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  const [storyViews, setStoryViews] = useState<StoryViews | null>(null);
  const [showStoryViewers, setShowStoryViewers] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [reactionBusy, setReactionBusy] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);
  const elapsedStoryMs = useRef(0);
  const activeStoryId = useRef<string | null>(null);
  const initialStoryOpenedFor = useRef<string | undefined>();
  const composerRef = useRef<HTMLFormElement>(null);

  const flatStories = useMemo(() => groups.flatMap((group) =>
    group.stories.map((story) => ({ group, story }))), [groups]);
  const orderedGroups = useMemo(() => [...groups].sort((left, right) => {
    if (left.user.id === user?.id) return -1;
    if (right.user.id === user?.id) return 1;
    if (left.has_unviewed !== right.has_unviewed) return left.has_unviewed ? -1 : 1;
    return (right.stories[right.stories.length - 1]?.created_at ?? 0) - (left.stories[left.stories.length - 1]?.created_at ?? 0);
  }), [groups, user?.id]);
  const selectedIndex = flatStories.findIndex(({ story }) => story.id === selectedId);
  const selected = selectedIndex >= 0 ? flatStories[selectedIndex] : null;
  const selectedStoryIndex = selected?.group.stories.findIndex((story) => story.id === selected.story.id) ?? -1;
  const ownStories = groups.find((group) => group.user.id === user?.id);

  async function refresh() {
    try {
      setGroups(await api.stories());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Stories could not be loaded");
    }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);
  useEffect(() => {
    if (!initialUserId || !groups.length || selectedId || initialStoryOpenedFor.current === initialUserId) return;
    const target = groups.find((group) => group.user.id === initialUserId);
    if (!target?.stories.length) return;
    initialStoryOpenedFor.current = initialUserId;
    openStory(target.stories.find((story) => !story.viewed)?.id ?? target.stories[0].id);
  }, [initialUserId, groups, selectedId]);
  useEffect(() => {
    if (!image) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setImageUrl(null);
    if (!selected?.story.has_image) return;
    void api.storyImage(selected.story.id).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setImageUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Story image could not be loaded");
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected?.story.id, selected?.story.has_image]);
  useEffect(() => {
    let active = true;
    setStoryViews(null);
    setShowStoryViewers(false);
    if (!selected || selected.group.user.id !== user?.id) return;
    void api.storyViews(selected.story.id).then((result) => {
      if (active) setStoryViews(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Story viewers could not be loaded");
    });
    return () => { active = false; };
  }, [selected?.story.id, selected?.group.user.id, user?.id]);
  useEffect(() => {
    if (!selectedId) {
      activeStoryId.current = null;
      elapsedStoryMs.current = 0;
      setStoryProgress(0);
      setStoryPaused(false);
      return;
    }
    if (activeStoryId.current !== selectedId) {
      activeStoryId.current = selectedId;
      elapsedStoryMs.current = 0;
      setStoryProgress(0);
      setStoryPaused(false);
    }
    if (storyPaused || showStoryViewers || !documentVisible) return;

    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = elapsedStoryMs.current + performance.now() - startedAt;
      setStoryProgress(Math.min(100, elapsed / 80));
      if (elapsed >= 8000) {
        window.clearInterval(timer);
        elapsedStoryMs.current = 0;
        advanceStory(1);
      }
    }, 50);
    return () => {
      window.clearInterval(timer);
      elapsedStoryMs.current = Math.min(8000, elapsedStoryMs.current + performance.now() - startedAt);
    };
  }, [selectedId, storyPaused, showStoryViewers, documentVisible]);
  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
      if (event.key === "ArrowRight") advanceStory(1);
      if (event.key === "ArrowLeft") advanceStory(-1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, selectedIndex, flatStories.length]);

  function openStory(storyId: string) {
    setSelectedId(storyId);
    setShowStoryViewers(false);
    setReplyText("");
    const entry = flatStories.find(({ story }) => story.id === storyId);
    if (!entry || entry.group.user.id === user?.id || entry.story.viewed) return;
    void api.viewStory(storyId).then(() => {
      setGroups((current) => current.map((group) => group.user.id !== entry.group.user.id ? group : {
        ...group,
        stories: group.stories.map((story) => story.id === storyId ? { ...story, viewed: true } : story),
        has_unviewed: group.stories.some((story) => story.id !== storyId && !story.viewed),
      }));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Story view could not be saved"));
  }

  async function reactToSelectedStory(reaction: string) {
    if (!selected || selected.group.user.id === user?.id || reactionBusy) return;
    setReactionBusy(true);
    try {
      const result = await api.reactToStory(selected.story.id, reaction);
      setGroups((current) => current.map((group) => group.user.id !== selected.group.user.id ? group : {
        ...group,
        stories: group.stories.map((story) => story.id === selected.story.id
          ? { ...story, my_reaction: result.reaction, reaction_count: result.count }
          : story),
      }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reaction could not be saved");
    } finally {
      setReactionBusy(false);
    }
  }

  async function replyToSelectedStory(event: FormEvent) {
    event.preventDefault();
    const message = replyText.trim();
    if (!selected || !message || replyBusy) return;
    setReplyBusy(true);
    try {
      await onReply(selected.group.user.id, message);
      setReplyText("");
      setSelectedId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reply could not be sent");
    } finally {
      setReplyBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() && !image) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = image ? await prepareGroupImage(image, "story image") : null;
      let imageData: string | undefined;
      if (prepared) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Story image could not be read"));
          reader.onerror = () => reject(new Error("Story image could not be read"));
          reader.readAsDataURL(prepared);
        });
        imageData = dataUrl.split(",", 2)[1];
      }
      await api.createStory(text.trim(), imageData, prepared?.type, audience);
      setText("");
      setImage(null);
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Story could not be published");
    } finally {
      setBusy(false);
    }
  }

  async function removeStory(story: StoryItem) {
    if (!window.confirm("Delete this story?")) return;
    try {
      await api.deleteStory(story.id);
      setSelectedId(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Story could not be deleted");
    }
  }

  function advanceStory(direction: -1 | 1) {
    const next = flatStories[selectedIndex + direction];
    if (next) openStory(next.story.id);
    else if (direction > 0) setSelectedId(null);
  }

  function handleStoryTouchEnd(event: TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 48) {
      event.preventDefault();
      advanceStory(delta < 0 ? 1 : -1);
    }
  }

  function openComposer() {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    fileInput.current?.click();
  }

  return (
    <div className="h-full overflow-y-auto px-1 sm:px-2">
      <div className="mx-auto max-w-5xl space-y-4 pb-8">
        <header className="rounded-2xl border border-line bg-gradient-to-r from-amber/10 via-panel to-emerald-500/10 p-4 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">Moments · expire after 24 hours</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Stories</h1>
          <p className="mt-2 text-sm text-dim">Only people who follow you can see your stories. You can also limit them to followers you have messaged.</p>
          <div aria-label="Recent stories" className="mt-5 flex items-start gap-3 overflow-x-auto overscroll-x-contain pb-2">
            <button type="button" onClick={() => ownStories?.stories.length
              ? openStory(ownStories.stories.find((story) => !story.viewed)?.id ?? ownStories.stories[0].id)
              : openComposer()}
              className="flex w-[76px] shrink-0 flex-col items-center gap-2 text-center">
              <span className={`relative grid h-[70px] w-[70px] place-items-center rounded-full p-[3px] ${ownStories?.has_unviewed ? "bg-gradient-to-tr from-emerald-400 to-lime-300" : "bg-muted"}`}>
                <span className="grid h-full w-full place-items-center rounded-full bg-panel">
                  <Avatar name={user?.display_name ?? "Your story"} imageUrl={user?.avatar_url} size={58} />
                </span>
                <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-panel bg-amber text-canvas"><Plus size={14} /></span>
              </span>
              <span className="w-full truncate text-xs text-dim">Your story</span>
            </button>
            {orderedGroups.filter((group) => group.user.id !== user?.id).map((group) => <button key={group.user.id} type="button" onClick={() => openStory(group.stories.find((story) => !story.viewed)?.id ?? group.stories[0].id)}
              className="flex w-[76px] shrink-0 flex-col items-center gap-2 text-center">
              <span className={`grid h-[70px] w-[70px] place-items-center rounded-full p-[3px] ${group.user.id === user?.id || !group.has_unviewed ? "bg-muted" : "bg-gradient-to-tr from-emerald-400 to-lime-300"}`}>
                <span className="grid h-full w-full place-items-center rounded-full bg-panel"><Avatar name={group.user.display_name} imageUrl={group.user.avatar_url} size={58} /></span>
              </span>
              <span className="flex w-full items-center justify-center gap-1 text-xs text-dim">
                <span className="truncate">{group.user.id === user?.id ? "Your story" : group.user.display_name}</span>
                {group.user.id !== user?.id && group.user.is_verified && <VerifiedBadge className="h-3 w-3" />}
              </span>
            </button>)}
          </div>
        </header>
        <Panel className="overflow-hidden rounded-2xl p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ImagePlus size={19} className="text-amber" />Share a story</h2>
          <p className="mt-1 text-sm text-dim">Stories are only visible to people who follow you. Choose whether to further limit this story to direct-message contacts.</p>
          <form ref={composerRef} onSubmit={(event) => void submit(event)} className="mt-4 grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="relative mx-auto flex aspect-[9/16] max-h-[340px] min-h-0 w-full max-w-[215px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-line bg-neutral-950 shadow-lg">
              {previewUrl ? <>
                <img src={previewUrl} alt="Selected story preview" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-2">
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white hover:bg-black/80" aria-label="Change story image"
                    onClick={() => fileInput.current?.click()}><ImagePlus size={18} /></button>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-black/65 text-white hover:bg-black/80" aria-label="Remove story image"
                    onClick={() => { setImage(null); if (fileInput.current) fileInput.current.value = ""; }}><X size={18} /></button>
                </div>
              </> : <button type="button" onClick={() => fileInput.current?.click()}
                className="flex h-full w-full flex-col items-center justify-center rounded-xl p-4 text-center text-white transition hover:bg-white/5">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-amber/15 text-amber"><ImagePlus size={23} /></span>
                <span className="mt-3 text-sm font-medium">Add to your story</span>
                <span className="mt-1 text-[11px] text-white/60">Portrait preview · up to 2 MB</span>
              </button>}
              <input ref={fileInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setImage(event.currentTarget.files?.[0] ?? null)} />
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated/20 p-3">
                <Avatar name={user?.display_name ?? "You"} imageUrl={user?.avatar_url} size={42} />
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-1 truncate text-sm font-medium">{user?.display_name}{user?.is_verified && <VerifiedBadge className="h-3 w-3" />}</p><p className="text-xs text-dim">Your story · expires in 24 hours</p></div>
              </div>
              <label className="block text-sm">Story audience
                <select className="field mt-1" value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}>
                  <option value="all">All my followers</option>
                  <option value="messages">Followers I have exchanged direct messages with</option>
                </select>
              </label>
            <label className="block text-sm">Story text <span className="text-muted">(optional with an image, up to 500 characters)</span>
              <textarea className="field mt-1 min-h-40 resize-y" value={text} onChange={(event) => setText(event.target.value)} maxLength={500}
                placeholder={image ? "Add a caption…" : "Write something to share…"} />
            </label>
            <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <span className="text-xs text-dim">{text.length}/500</span>
              <button className="btn btn-primary ml-auto min-w-36 justify-center" disabled={busy || (!text.trim() && !image)}>
                <Plus size={16} />{busy ? "Publishing…" : "Post story"}
              </button>
            </div>
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            </div>
          </form>
        </Panel>

      </div>

      {selected && <div className="fixed inset-0 z-[100] bg-black text-white" role="dialog" aria-modal="true" aria-label={`${selected.group.user.display_name}'s story`}
        onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }} onTouchEnd={handleStoryTouchEnd}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative h-[100dvh] w-full overflow-hidden bg-neutral-950 sm:h-[96dvh] sm:w-auto sm:aspect-[9/16] sm:max-w-[calc(96dvh*9/16)] sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-2xl">
            {selected.story.has_image && (imageUrl
              ? <img src={imageUrl} alt="Story" className="absolute inset-0 h-full w-full bg-neutral-950 object-contain" />
              : <div className="absolute inset-0 grid place-items-center text-sm text-white/70">Loading story…</div>)}
            {!selected.story.has_image && <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-fuchsia-950 to-orange-900" />}
            {selected.story.has_image && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />}
            <div className="absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4">
              <div className="flex gap-1">
                {selected.group.stories.map((story, index) => <span key={story.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                  <span className="block h-full rounded-full bg-white"
                    style={{ width: index < selectedStoryIndex ? "100%" : index === selectedStoryIndex ? `${storyProgress}%` : "0%" }} />
                </span>)}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Avatar name={selected.group.user.display_name} imageUrl={selected.group.user.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold drop-shadow">{selected.group.user.display_name}{selected.group.user.is_verified && <VerifiedBadge className="h-4 w-4" />}</p>
                  <p className="text-xs text-white/75">{storyTime(selected.story.created_at)}</p>
                </div>
                <button type="button" className="rounded-full p-2 hover:bg-white/15" aria-label={storyPaused ? "Resume story" : "Pause story"}
                  onClick={() => setStoryPaused((paused) => !paused)}>{storyPaused ? <Play size={18} /> : <Pause size={18} />}</button>
                {selected.group.user.id === user?.id && <button type="button" className="rounded-full p-2 hover:bg-white/15" aria-label="Delete story" onClick={() => void removeStory(selected.story)}><Trash2 size={19} /></button>}
                <button type="button" className="rounded-full p-2 hover:bg-white/15" aria-label="Collapse story viewer" title="Collapse story viewer"
                  onClick={() => setSelectedId(null)}><ChevronDown size={23} /></button>
              </div>
            </div>
            {selected.story.text && <p className={`absolute inset-x-6 z-10 whitespace-pre-wrap break-words text-center text-xl font-medium drop-shadow-lg sm:text-2xl ${selected.story.has_image ? "bottom-16" : "top-1/2 -translate-y-1/2"}`}>
              {selected.story.text}
            </p>}
            <button type="button" className="absolute inset-y-20 left-0 z-10 w-[28%] cursor-default" aria-label="Previous story" onClick={() => advanceStory(-1)} />
            <button type="button" className="absolute inset-y-20 right-0 z-10 w-[72%] cursor-default" aria-label="Next story" onClick={() => advanceStory(1)} />
            <button type="button" className="absolute left-2 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/35 text-white/90 shadow-lg hover:bg-black/65"
              aria-label="Previous story" title="Previous story" onClick={() => advanceStory(-1)}><ChevronLeft size={25} /></button>
            <button type="button" className="absolute right-2 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/35 text-white/90 shadow-lg hover:bg-black/65"
              aria-label="Next story" title="Next story" onClick={() => advanceStory(1)}><ChevronRight size={25} /></button>
            {showStoryViewers && selected.group.user.id === user?.id && <div className="absolute inset-x-3 bottom-16 z-30 max-h-[38%] overflow-y-auto rounded-xl border border-white/15 bg-neutral-950/90 p-3 backdrop-blur">
              <p className="mb-2 text-sm font-semibold">Viewed by · {storyViews?.count ?? selected.story.view_count ?? 0}</p>
              {storyViews?.viewers.length
                ? <ul className="space-y-2">{storyViews.viewers.map((viewer) => <li key={viewer.id} className="flex items-center gap-2">
                    <Avatar name={viewer.display_name} imageUrl={viewer.avatar_url} size={32} />
                    <span className="min-w-0 flex-1 truncate text-sm">{viewer.display_name}{viewer.is_verified && <VerifiedBadge className="ml-1 inline-block h-3 w-3 align-middle" />}</span>
                    <span className="shrink-0 text-[11px] text-white/60">{new Date(viewer.viewed_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </li>)}</ul>
                : <p className="text-xs text-white/60">No views yet</p>}
            </div>}
            <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-white/70">
              {selected.group.user.id === user?.id
                ? <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-2 hover:bg-white/15"
                    aria-expanded={showStoryViewers} onClick={() => setShowStoryViewers((visible) => !visible)}>
                    <Eye size={15} />{storyViews?.count ?? selected.story.view_count ?? 0} views
                  </button>
                : <div className="flex min-w-0 flex-1 items-center gap-2">
                    <form onSubmit={(event) => void replyToSelectedStory(event)} className="flex min-w-0 flex-1 items-center gap-2">
                      <input className="min-w-0 flex-1 rounded-full border border-white/25 bg-black/40 px-4 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/60 focus:outline-none"
                        aria-label={`Reply to ${selected.group.user.display_name}'s story`} placeholder="Reply to story…" maxLength={4000}
                        value={replyText} onChange={(event) => setReplyText(event.target.value)} />
                      <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25"
                        aria-label="Send story reply" disabled={replyBusy || !replyText.trim()}><Send size={17} /></button>
                    </form>
                  </div>}
              <span>{selectedIndex + 1} / {flatStories.length}</span>
            </div>
            {selected.group.user.id !== user?.id && <div className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-black/45 px-3 py-2 backdrop-blur">
              {["❤️", "😂", "😮", "😢", "👏", "🔥"].map((reaction) => <button key={reaction} type="button"
                className={`grid h-9 w-9 place-items-center rounded-full text-xl transition hover:scale-110 hover:bg-white/15 ${selected.story.my_reaction === reaction ? "bg-white/20 ring-1 ring-white/70" : ""}`}
                aria-label={`React ${reaction}`} aria-pressed={selected.story.my_reaction === reaction}
                disabled={reactionBusy} onClick={() => void reactToSelectedStory(reaction)}>{reaction}</button>)}
            </div>}
            {selected.story.reaction_count ? <span className="absolute bottom-28 right-4 z-20 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white/90">
              {selected.story.reaction_count} reaction{selected.story.reaction_count === 1 ? "" : "s"}
            </span> : null}
            {error && <p role="alert" className="absolute bottom-36 left-3 right-3 z-30 rounded-lg bg-black/80 p-2 text-center text-xs text-white">{error}</p>}
          </div>
        </div>
      </div>}
    </div>
  );
}
