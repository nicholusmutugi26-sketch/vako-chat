import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, CheckCheck, Copy, Forward, ImagePlus, Info, LogOut, MailCheck, MessageSquarePlus, MoreHorizontal, Pause, Pencil, Play, Plus, Reply, Search, Send, Shield, ShieldOff, Smile, Trash2, UserCheck, UserPlus, UserRoundX, Users, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Avatar, ConnectionBadge, EmptyState, Panel, Presence } from "../components/ui";
import NewConversation from "../components/NewConversation";
import StoryRail from "../components/StoryRail";
import UserProfileDialog from "../components/UserProfileDialog";
import VerifiedBadge from "../components/VerifiedBadge";
import { api } from "../services/api";
import type { ChatMessage, GroupInvite, Member } from "../types";

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const EmojiPicker = lazy(() => import("emoji-picker-react"));
export default function Messages({ kind, onOpenStories }: { kind: "all" | "group"; onOpenStories: (userId?: string) => void }) {
  const a = useApp();
  const [q, setQ] = useState(""); const [text, setText] = useState("");
  const [showNew, setShowNew] = useState(false); const [showMembers, setShowMembers] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false); const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState(""); const [groupDescription, setGroupDescription] = useState("");
  const [groupAvatarMenuOpen, setGroupAvatarMenuOpen] = useState(false);
  const [groupAvatarBusy, setGroupAvatarBusy] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null); const [infoFor, setInfoFor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [showUnreadCounts, setShowUnreadCounts] = useState(() => localStorage.getItem("vk_notify") !== "off");
  const [showPreviews, setShowPreviews] = useState(() => localStorage.getItem("vk_show_previews") !== "off");
  const [compactList, setCompactList] = useState(() => localStorage.getItem("vk_compact_list") === "on");
  const [groupInvites, setGroupInvites] = useState<GroupInvite[]>([]);
  const [groupInviteError, setGroupInviteError] = useState<string | null>(null);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteUsers, setInviteUsers] = useState<Member[]>([]);
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [memberListTarget, setMemberListTarget] = useState<Member | null>(null);
  const [memberFollowers, setMemberFollowers] = useState<Member[]>([]);
  const [memberListError, setMemberListError] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [suggestedUsers, setSuggestedUsers] = useState<Member[]>([]);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [mobileSplit, setMobileSplit] = useState(() => localStorage.getItem("vk_mobile_split") === "on");
  const [selectingMessages, setSelectingMessages] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const groupAvatarInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const lastTypingSent = useRef(0);
  const list = a.conversations
    .filter((c) => (kind === "all" ? c.kind === "direct" : c.kind === "group") && c.title.toLowerCase().includes(q.toLowerCase()))
    .sort((left, right) => (Date.parse(right.last_at ?? "") || 0) - (Date.parse(left.last_at ?? "") || 0));
  const active = a.conversations.find((c) => c.id === a.activeId &&
    (kind === "all" ? c.kind === "direct" : c.kind === "group")) ?? null;
  const directChatMember = active?.kind === "direct"
    ? active.members.find((member) => member.id !== a.user?.id)
    : null;
  const editingGroup = a.conversations.find((conversation) => conversation.id === editingGroupId && conversation.kind === "group");
  const msgs = (active && a.messages[active.id]) || [];
  useEffect(() => {
    const updatePreferences = () => {
      setShowUnreadCounts(localStorage.getItem("vk_notify") !== "off");
      setShowPreviews(localStorage.getItem("vk_show_previews") !== "off");
      setCompactList(localStorage.getItem("vk_compact_list") === "on");
      setMobileSplit(localStorage.getItem("vk_mobile_split") === "on");
    };
    window.addEventListener("vk-settings-updated", updatePreferences);
    return () => window.removeEventListener("vk-settings-updated", updatePreferences);
  }, []);
  useEffect(() => {
    if (kind !== "all" || list.length > 0) {
      setSuggestedUsers([]);
      return;
    }
    let activeEffect = true;
    void api.users().then((users) => {
      if (activeEffect) {
        setSuggestedUsers(users.slice(0, 6));
        setSuggestionError(null);
      }
    }).catch((error: unknown) => {
      if (activeEffect) setSuggestionError(error instanceof Error ? error.message : "Suggested people could not be loaded");
    });
    return () => { activeEffect = false; };
  }, [kind, list.length]);
  async function messageSuggestedUser(member: Member) {
    try {
      const conversationId = await a.openDirect(member.id);
      a.select(conversationId);
      setShowNew(false);
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Conversation could not be started");
    }
  }
  async function followSuggestedUser(member: Member) {
    try {
      const result = member.is_following ? await api.unfollowUser(member.id) : await api.followUser(member.id);
      setSuggestedUsers((current) => current.map((item) => item.id === member.id
        ? { ...item, is_following: result.is_following, follower_count: result.followers }
        : item));
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Follow status could not be updated");
    }
  }
  useEffect(() => {
    if (!menuFor) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [menuFor]);
  const replyPrefix = replyTo
    ? `> ${replyTo.sender_name}: ${replyTo.text.slice(0, 180)}${replyTo.text.length > 180 ? "…" : ""}\n\n`
    : "";
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, active?.id]);
  useEffect(() => {
    setSelectingMessages(false);
    setSelectedMessageIds(new Set());
  }, [active?.id]);
  useEffect(() => {
    if (!active || active.kind !== "group") return;
    setGroupTitle(active.title);
    setGroupDescription(active.description);
  }, [active?.id, active?.title, active?.description]);
  useEffect(() => {
    if (kind !== "group") return;
    let activeEffect = true;
    const loadInvites = () => void api.groupInvites().then((items) => {
      if (activeEffect) {
        setGroupInvites(items);
        setGroupInviteError(null);
      }
    }).catch((error: unknown) => {
      if (activeEffect) setGroupInviteError(error instanceof Error ? error.message : "Group invitations could not be loaded");
    });
    loadInvites();
    const interval = window.setInterval(loadInvites, 15000);
    return () => { activeEffect = false; window.clearInterval(interval); };
  }, [kind]);
  useEffect(() => {
    if (!active || active.kind !== "group" || !showMembers || !active.is_admin || !inviteQuery.trim()) {
      setInviteUsers([]);
      return;
    }
    let current = true;
    const timeout = window.setTimeout(() => {
      void api.users(inviteQuery).then((users) => {
        if (current) setInviteUsers(users.filter((candidate) => !active.members.some((member) => member.id === candidate.id)));
      }).catch((error: unknown) => {
        if (current) setActionNotice(error instanceof Error ? error.message : "Users could not be searched");
      });
    }, 250);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [active?.id, active?.members, active?.is_admin, inviteQuery, showMembers]);
  useEffect(() => {
    const conversationId = active?.id;
    return () => {
      if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current);
      if (conversationId) a.setTyping(conversationId, false);
      lastTypingSent.current = 0;
    };
  }, [active?.id, a.setTyping]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim(); if (!t) return;
    if (active) a.setTyping(active.id, false);
    if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current);
    const body = `${replyPrefix}${t}`;
    a.send(body); setText(""); setReplyTo(null);
  }
  function changeText(value: string) {
    setText(value);
    if (!active) return;
    if (!value.trim()) {
      if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current);
      a.setTyping(active.id, false);
      lastTypingSent.current = 0;
      return;
    }
    if (Date.now() - lastTypingSent.current >= 1000) {
      a.setTyping(active.id, true);
      lastTypingSent.current = Date.now();
    }
    if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(() => {
      a.setTyping(active.id, false);
      lastTypingSent.current = 0;
      typingTimeout.current = null;
    }, 2500);
  }
  function insertEmoji(emoji: string) {
    const element = input.current;
    const start = element?.selectionStart ?? text.length;
    const finish = element?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${emoji}${text.slice(finish)}`;
    changeText(next);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }
  async function saveGroup() {
    if (!editingGroupId) return;
    setSavingGroup(true);
    try {
      await a.updateGroup(editingGroupId, groupTitle.trim(), groupDescription.trim());
      setEditingGroupId(null);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Group details could not be updated");
    } finally {
      setSavingGroup(false);
    }
  }
  async function uploadGroupPicture(file: File | undefined) {
    if (!file || !editingGroupId) return;
    if (file.size > 25 * 1024 * 1024) {
      setActionNotice("Choose a group picture smaller than 25 MB");
      return;
    }
    setGroupAvatarBusy(true);
    setActionNotice(null);
    try {
      await a.uploadGroupAvatar(editingGroupId, file);
      setActionNotice("Group picture updated");
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Group picture could not be uploaded");
    } finally {
      setGroupAvatarBusy(false);
    }
  }
  async function removeGroupPicture() {
    if (!editingGroupId) return;
    setGroupAvatarBusy(true);
    setActionNotice(null);
    try {
      await a.deleteGroupAvatar(editingGroupId);
      setActionNotice("Group picture removed");
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Group picture could not be removed");
    } finally {
      setGroupAvatarBusy(false);
      setGroupAvatarMenuOpen(false);
    }
  }
  async function respondToInvite(invite: GroupInvite, accept: boolean) {
    setMemberBusy(invite.id);
    setGroupInviteError(null);
    try {
      if (accept) {
        const joined = await api.acceptGroupInvite(invite.id);
        await a.refreshConversations();
        a.select(joined.id);
      } else {
        await api.declineGroupInvite(invite.id);
      }
      setGroupInvites((current) => current.filter((item) => item.id !== invite.id));
    } catch (error) {
      setGroupInviteError(error instanceof Error ? error.message : "Invitation could not be updated");
    } finally {
      setMemberBusy(null);
    }
  }
  async function inviteMember(member: Member) {
    if (!active || active.kind !== "group") return;
    setMemberBusy(member.id);
    try {
      await api.inviteToGroup(active.id, member.id);
      setActionNotice(`Invitation sent to ${member.display_name}`);
      setInviteUsers((current) => current.filter((candidate) => candidate.id !== member.id));
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Invitation could not be sent");
    } finally {
      setMemberBusy(null);
    }
  }
  async function toggleMemberFollow(member: Member) {
    setMemberBusy(member.id);
    try {
      if (member.is_following) await api.unfollowUser(member.id);
      else await api.followUser(member.id);
      await a.refreshConversations();
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Follow status could not be updated");
    } finally {
      setMemberBusy(null);
    }
  }
  async function changeMemberAdmin(member: Member, enabled: boolean) {
    if (!active || active.kind !== "group") return;
    setMemberBusy(member.id);
    try {
      await api.setGroupAdmin(active.id, member.id, enabled);
      await a.refreshConversations();
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Group role could not be changed");
    } finally {
      setMemberBusy(null);
    }
  }
  async function removeMember(member: Member) {
    if (!active || active.kind !== "group" || !window.confirm(`Remove ${member.display_name} from ${active.title}?`)) return;
    setMemberBusy(member.id);
    try {
      await api.removeGroupMember(active.id, member.id);
      await a.refreshConversations();
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Member could not be removed");
    } finally {
      setMemberBusy(null);
    }
  }
  async function leaveActiveGroup() {
    if (!active || active.kind !== "group" || !window.confirm(`Leave ${active.title}? You will need a new invitation to rejoin.`)) return;
    setMemberBusy(active.id);
    try {
      await api.leaveGroup(active.id);
      a.select(null);
      await a.refreshConversations();
      setShowMembers(false);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Could not leave the group");
    } finally {
      setMemberBusy(null);
    }
  }
  async function showMemberFollowers(member: Member) {
    setMemberListTarget(member);
    setMemberFollowers([]);
    setMemberListError(null);
    try {
      setMemberFollowers(await api.followers(member.id));
    } catch (error) {
      setMemberListError(error instanceof Error ? error.message : "Followers could not be loaded");
    }
  }
  async function deleteConversation() {
    if (!active || active.kind !== "direct" ||
        !window.confirm(`Remove your conversation with ${active.title}? It will be hidden only for you; the other person keeps their history.`)) return;
    setActionNotice(null);
    try {
      await a.hideConversation(active.id);
      setSelectingMessages(false);
      setSelectedMessageIds(new Set());
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Conversation could not be removed");
    }
  }
  async function deleteSelectedMessages() {
    if (!active || selectedMessageIds.size === 0 || !window.confirm(
      `Delete ${selectedMessageIds.size} selected message${selectedMessageIds.size === 1 ? "" : "s"} for everyone? Only messages you sent are eligible.`,
    )) return;
    setBulkDeleteBusy(true);
    setActionNotice(null);
    try {
      await a.removeMessages([...selectedMessageIds], active.id);
      setSelectedMessageIds(new Set());
      setSelectingMessages(false);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Selected messages could not be deleted");
    } finally {
      setBulkDeleteBusy(false);
    }
  }
  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }
  return (
    <div className={`messages-layout flex h-full min-h-0 gap-3 ${mobileSplit ? "mobile-split" : ""}`}>
      {/* conversation column: hidden on mobile when a chat is open */}
      <Panel className={`relative ${active && !mobileSplit ? "hidden md:flex" : "flex"} flex-col w-full md:w-72 shrink-0 min-h-0 mobile-split-list`}>
        {kind === "group" && <div className="p-3 flex items-center justify-between">
          <h2 className="font-semibold">Groups</h2>
          <button className="btn btn-ghost !px-2" aria-label="New group" onClick={() => setShowNew(true)}><Plus size={18} /></button>
        </div>}
        {kind === "all" && <StoryRail onOpen={onOpenStories} />}
        {kind === "group" && groupInvites.length > 0 && <section className="mx-3 mb-3 rounded-xl border border-amber/25 bg-amber/5 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><MailCheck size={16} className="text-amber" />Group invitations <span className="ml-auto rounded-full bg-amber px-2 py-0.5 text-xs text-canvas">{groupInvites.length}</span></h3>
          <div className="space-y-2">
            {groupInvites.map((invite) => <div key={invite.id} className="rounded-lg border border-line bg-panel p-2.5">
              <p className="truncate text-sm font-medium">{invite.title}</p>
              <p className="mt-0.5 text-xs text-dim">Invited by {invite.inviter_name} (@{invite.inviter_username})</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-primary !min-h-9 flex-1 !px-2 text-xs" disabled={memberBusy === invite.id}
                  onClick={() => void respondToInvite(invite, true)}><Check size={14} />Accept</button>
                <button type="button" className="btn btn-ghost !min-h-9 flex-1 !px-2 text-xs" disabled={memberBusy === invite.id}
                  onClick={() => void respondToInvite(invite, false)}><X size={14} />Decline</button>
              </div>
            </div>)}
          </div>
          {groupInviteError && <p role="alert" className="mt-2 text-xs text-bad">{groupInviteError}</p>}
        </section>}
        <div className="mt-2 flex items-center gap-2 px-3 pb-2">
          <div className="relative min-w-0 flex-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted" />
            <input className="field !pl-10" placeholder={kind === "group" ? "Search groups…" : "Search messages…"} aria-label={kind === "group" ? "Search groups" : "Search messages"} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <ul className={`flex-1 overflow-y-auto ${kind === "all" ? "pb-20" : ""}`}>
          {list.length === 0 && kind === "all" && suggestedUsers.length > 0
            ? <li className="p-3">
              <h3 className="mb-1 text-sm font-semibold">People to get started with</h3>
              <p className="mb-3 text-xs text-dim">Start a conversation and follow people you know.</p>
              <ul className="space-y-2">{suggestedUsers.map((member) => <li key={member.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-elevated/30 p-2">
                <Avatar name={member.display_name} imageUrl={member.avatar_url} size={34} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{member.display_name}</span>
                <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-panel" title="Start conversation"
                  aria-label={`Message ${member.display_name}`} onClick={() => void messageSuggestedUser(member)}><MessageSquarePlus size={16} /></button>
                <button type="button" className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-panel ${member.is_following ? "text-amber" : ""}`}
                  title={member.is_following ? "Unfollow" : "Follow"} aria-label={`${member.is_following ? "Unfollow" : "Follow"} ${member.display_name}`}
                  onClick={() => void followSuggestedUser(member)}>{member.is_following ? <UserCheck size={16} /> : <UserPlus size={16} />}</button>
              </li>)}</ul>
              {suggestionError && <p role="alert" className="mt-2 text-xs text-bad">{suggestionError}</p>}
            </li>
            : list.length === 0 && <EmptyState text={kind === "group" ? "No groups yet" : "No conversations yet"} />}
          {list.map((c) => {
            const lastMessageIsMine = c.last_message_sender_id === a.user?.id;
            const lastMessageStatus = c.last_message_status ?? "sent";
            const typingUsers = a.typing[c.id] ?? [];
            return <li key={c.id} className="border-b border-line">
              <button onClick={() => a.select(c.id)} aria-current={c.id === a.activeId}
                className={`w-full text-left flex gap-3 items-center ${compactList ? "p-2 min-h-[48px]" : "p-3 min-h-[56px]"} ${c.id === a.activeId ? "bg-elevated border-l-2 border-amber" : "hover:bg-elevated border-l-2 border-transparent"}`}>
                <Avatar name={c.title} kind={c.kind === "group" ? "group" : "user"}
                  imageUrl={c.kind === "direct" ? c.members.find((m) => m.id !== a.user?.id)?.avatar_url : c.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><span className="flex min-w-0 items-center gap-1 truncate font-medium">{c.title}{c.kind === "direct" && c.members.find((m) => m.id !== a.user?.id)?.is_verified && <VerifiedBadge className="h-3 w-3" />}</span><span className="text-xs text-muted">{hhmm(c.last_at)}</span></div>
                  <div className="flex min-w-0 items-center gap-2">
                  <span className={`min-w-0 flex-1 truncate text-sm ${typingUsers.length ? "text-amber" : "text-dim"}`}>
                    {typingUsers.length
                      ? `${typingUsers.slice(0, 2).join(", ")}${typingUsers.length > 2 ? ` +${typingUsers.length - 2}` : ""} typing…`
                      : showPreviews ? c.last_text ?? "No messages yet" : "Conversation"}
                  </span>
                    {(a.unread[c.id] ?? c.unread_count) > 0 && showUnreadCounts
                      ? <span className="shrink-0 rounded-full bg-amber px-2 text-xs font-semibold text-canvas"
                          aria-label={`${a.unread[c.id] ?? c.unread_count} unread message${(a.unread[c.id] ?? c.unread_count) === 1 ? "" : "s"}`}
                          title={`${a.unread[c.id] ?? c.unread_count} unread`}>{a.unread[c.id] ?? c.unread_count}</span>
                      : lastMessageIsMine ? lastMessageStatus === "read" || lastMessageStatus === "delivered"
                      ? <span title={lastMessageStatus === "read" ? "Read" : "Delivered"} className="shrink-0">
                          <CheckCheck size={16} aria-label={lastMessageStatus === "read" ? "Last message read" : "Last message delivered"}
                            className={lastMessageStatus === "read" ? "text-ok" : "text-dim"} />
                        </span>
                      : <span title="Sent" className="shrink-0"><Check size={15} aria-label="Last message sent" className="text-dim" /></span>
                      : null}
                  </div>
                </div>
              </button>
            </li>;
          })}
        </ul>
        {kind === "all" && !active && <button type="button" className="absolute bottom-4 right-4 z-10 grid h-14 w-14 place-items-center rounded-full bg-amber text-canvas shadow-xl transition hover:scale-105"
          aria-label="Start a conversation" title="Start a conversation" onClick={() => setShowNew(true)}><MessageSquarePlus size={23} /></button>}
      </Panel>

      <Panel className={`${active || mobileSplit ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0 min-h-0 mobile-split-chat`}>
        {!active ? <EmptyState text="Select a conversation" /> : (<>
          <header className="p-3 border-b border-line flex items-center gap-3">
            <button className="md:hidden btn btn-ghost !px-2" aria-label="Back" onClick={() => a.select(null)}><ArrowLeft size={18} /></button>
            <button type="button" className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
              onClick={() => active.kind === "group" ? setShowMembers(true) : directChatMember && setProfileUserId(directChatMember.id)}
              aria-label={active.kind === "group" ? "Open group information" : `View ${directChatMember?.display_name ?? active.title}'s profile`}>
              <Avatar name={active.title} kind={active.kind === "group" ? "group" : "user"}
                imageUrl={active.kind === "direct" ? directChatMember?.avatar_url : active.avatar_url} />
            </button>
            <button type="button" className="min-w-0 flex-1 text-left"
              onClick={() => {
                if (active.kind === "group") setShowMembers(true);
                else if (directChatMember) setProfileUserId(directChatMember.id);
              }}>
              <h2 className="flex items-center gap-1 truncate font-semibold">{active.title}{directChatMember?.is_verified && <VerifiedBadge className="h-4 w-4" />}</h2>
              <p className="truncate text-xs text-dim">{active.kind === "group"
                ? active.description || `${active.members.length} members · Group`
                : "Direct message"}</p>
            </button>
            <span className="hidden sm:inline-flex"><ConnectionBadge state={a.conn} /></span>
            <button type="button" className={`btn btn-ghost !px-2 ${selectingMessages ? "text-amber" : ""}`}
              aria-pressed={selectingMessages} aria-label={selectingMessages ? "Cancel message selection" : "Select messages"}
              title={selectingMessages ? "Cancel selection" : "Select messages"}
              onClick={() => {
                setSelectingMessages((current) => !current);
                setSelectedMessageIds(new Set());
              }}>
              {selectingMessages ? <X size={17} /> : <CheckCheck size={17} />}
            </button>
            {active.kind === "direct" && <button type="button" className="btn btn-ghost !px-2 text-bad"
              aria-label="Remove conversation for me" title="Remove conversation for me" onClick={() => void deleteConversation()}>
              <Trash2 size={17} />
            </button>}
            {active.kind === "group" && active.is_admin && <>
              <button className="btn btn-ghost !px-2" aria-label="Edit group details" title="Edit group details"
                onClick={() => { setGroupTitle(active.title); setGroupDescription(active.description); setEditingGroupId(active.id); }}>
                <Pencil size={17} />
              </button>
            </>}
            {active.kind === "group" && <button className="btn btn-ghost !px-2" aria-label="Group members and actions" title="Group members and actions"
              onClick={() => setShowMembers((s) => !s)}><Users size={18} /></button>}
          </header>
          {selectingMessages && <div className="flex flex-wrap items-center gap-2 border-b border-line bg-elevated/30 px-3 py-2">
            <span className="mr-auto text-xs text-dim">{selectedMessageIds.size} selected · select messages you sent</span>
            <button type="button" className="btn btn-ghost !min-h-9 !px-3 text-xs" disabled={!msgs.some((message) => message.sender_id === a.user?.id)}
              onClick={() => setSelectedMessageIds(new Set(msgs.filter((message) => message.sender_id === a.user?.id).map((message) => message.id)))}>
              Select mine
            </button>
            <button type="button" className="btn btn-ghost !min-h-9 !px-3 text-xs" onClick={() => setSelectedMessageIds(new Set())}>
              Clear
            </button>
            <button type="button" className="btn !min-h-9 !px-3 text-xs text-bad" disabled={selectedMessageIds.size === 0 || bulkDeleteBusy}
              onClick={() => void deleteSelectedMessages()}>
              <Trash2 size={14} />{bulkDeleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>}
          <div className="relative flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
                {msgs.length === 0 && <EmptyState text="No messages yet. Say hello." />}
                {msgs.map((m) => {
                  const mine = m.sender_id === a.user?.id;
                  const senderMember = active.members.find((member) => member.id === m.sender_id);
                  const rawStatus = mine ? (a.messageStatus[m.id] ?? m.status ?? "sent") : undefined;
                  const editAge = clock - Date.parse(m.created_at);
                  const canEdit = mine && editAge >= 0 && editAge <= 5 * 60 * 1000;
                  return (
                    <div key={m.id} className={`flex items-center gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                      {selectingMessages && mine && <input type="checkbox" className="h-5 w-5 shrink-0 accent-amber"
                        aria-label={`Select your message from ${hhmm(m.created_at)}`}
                        checked={selectedMessageIds.has(m.id)} onChange={() => toggleMessageSelection(m.id)} />}
                      <div className={`relative max-w-[80%] rounded-lg px-3 py-2 border ${mine ? "bg-amber-soft/30 border-amber-soft" : "bg-elevated border-line"}`}>
                        <div className="mb-0.5 flex items-center gap-3 text-xs text-dim">
                          <span className="flex min-w-0 items-center gap-1">
                            {mine ? "You" : m.sender_name}
                            {senderMember?.is_verified && <VerifiedBadge className="h-3 w-3" />}
                            <span>· {hhmm(m.created_at)}</span>
                          </span>
                          {!selectingMessages && <button className="rounded p-1 hover:bg-line" aria-label="Message options" title="Message options"
                            onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}><MoreHorizontal size={16} /></button>}
                        </div>
                        {editing === m.id ? <div className="mt-2 space-y-2">
                          <textarea className="field min-h-20" aria-label="Edit message" value={editText} maxLength={4000} onChange={(e) => setEditText(e.target.value)} />
                          <div className="flex justify-end gap-2">
                            <button className="btn btn-ghost !min-h-9 !px-3 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                            <button className="btn btn-primary !min-h-9 !px-3 text-xs" disabled={!editText.trim()} onClick={() => {
                              void a.editMessage(m.id, active.id, editText).then(() => setEditing(null))
                                .catch((e: unknown) => setActionNotice(e instanceof Error ? e.message : "Message could not be edited"));
                            }}>Save edit</button>
                          </div>
                        </div> : <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                        {m.edited_at && <p className="mt-1 text-[10px] text-dim text-right">edited</p>}
                        {mine && rawStatus && <p className="mt-1 text-[10px] flex items-center gap-1 justify-end text-dim"
                          title={rawStatus === "read" ? "Read" : rawStatus === "delivered" ? "Delivered" : rawStatus === "sent" ? "Sent" : rawStatus}>
                          {rawStatus === "pending" ? <span aria-label="Sending">◔</span>
                            : rawStatus === "failed" ? <span aria-label="Failed">!</span>
                              : rawStatus === "sent" ? <Check size={15} aria-label="Sent" />
                                : <CheckCheck size={17} aria-label={rawStatus === "read" ? "Read" : "Delivered"}
                                  className={rawStatus === "read" ? "text-ok" : "text-dim"} />}
                          {rawStatus}
                        </p>}
                        {menuFor === m.id && (
                          <div className="absolute right-2 top-9 z-20 min-w-36 rounded-md border border-line bg-sidebar p-1 shadow-xl">
                            <button className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-elevated" onClick={() => {
                              setReplyTo(m); setMenuFor(null); input.current?.focus();
                            }}><Reply size={15} />Reply</button>
                            <button className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-elevated" onClick={() => {
                              if (!navigator.clipboard?.writeText) {
                                setActionNotice("Clipboard access is unavailable in this browser context");
                              } else {
                                void navigator.clipboard.writeText(m.text).then(() => setActionNotice("Message copied"))
                                  .catch(() => setActionNotice("Clipboard access was denied"));
                              }
                              setMenuFor(null);
                            }}><Copy size={15} />Copy</button>
                            <button className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-elevated" onClick={() => {
                              setForwarding(m); setMenuFor(null);
                            }}><Forward size={15} />Forward</button>
                            {canEdit && <button className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-elevated" onClick={() => {
                              setEditing(m.id); setEditText(m.text); setMenuFor(null);
                            }}>Edit message</button>}
                            <button className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-elevated" onClick={() => {
                              setInfoFor(infoFor === m.id ? null : m.id); setMenuFor(null);
                            }}><Info size={15} />Info</button>
                            {mine && <button className="w-full flex items-center gap-2 rounded px-2 py-2 text-sm text-bad hover:bg-elevated"
                              onClick={() => { a.removeMessage(m.id, active.id); setMenuFor(null); }}><Trash2 size={15} />Delete</button>}
                          </div>
                        )}
                        {infoFor === m.id && <div className="mt-2 border-t border-line pt-2 text-xs text-dim">
                          <p>Message info</p>
                          <p>Origin node: {m.origin_node ?? "Unavailable"}</p>
                          <p>Delivered by: {m.delivered_nodes ?? "Not delivered yet"}</p>
                          <p>Delivery status: {mine ? rawStatus ?? "sent" : "Received"}</p>
                          <p>{new Date(m.created_at).toLocaleString()}</p>
                        </div>}
                      </div>
                    </div>
                  );
                })}
                <div ref={end} />
              </div>
              {!!(active && a.typing[active.id]?.length) && <p className="px-4 pb-2 text-xs text-dim" aria-live="polite">
                {active.kind === "group"
                  ? `${a.typing[active.id].slice(0, 2).join(", ")}${a.typing[active.id].length > 2 ? ` and ${a.typing[active.id].length - 2} others` : ""} typing…`
                  : `${a.typing[active.id][0]} is typing…`}
              </p>}
              {a.notice && <p className="px-4 pb-1 text-xs text-dim" role="status">{a.notice}</p>}
              {actionNotice && <p className="px-4 pb-1 text-xs text-dim" role="status">{actionNotice}</p>}
              {replyTo && <div className="mx-3 mb-1 flex items-center justify-between border-l-2 border-amber bg-elevated px-3 py-2 text-xs">
                <span className="truncate">Replying to {replyTo.sender_name}: {replyTo.text}</span>
                <button aria-label="Cancel reply" className="ml-2" onClick={() => setReplyTo(null)}><X size={15} /></button>
              </div>}
              <form onSubmit={submit} className="message-composer relative flex shrink-0 gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {showEmoji && <div className="absolute bottom-full right-14 z-20 mb-2 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line shadow-xl">
                  <Suspense fallback={<div className="grid h-[400px] w-[min(350px,calc(100vw-2rem))] place-items-center bg-sidebar text-sm text-dim">Loading emojis…</div>}>
                    <EmojiPicker theme="dark" onEmojiClick={(emoji) => insertEmoji(emoji.emoji)}
                      previewConfig={{ showPreview: false }} width={Math.min(350, window.innerWidth - 32)} height={400} />
                  </Suspense>
                </div>}
                <input ref={input} type="text" inputMode="text" enterKeyHint="send" autoCapitalize="sentences" autoCorrect="on"
                  className="message-composer-input field min-w-0 flex-1" placeholder={replyTo ? `Reply to ${replyTo.sender_name}…` : "Type a message…"} aria-label="Message" value={text}
                  maxLength={4000 - replyPrefix.length} onChange={(e) => changeText(e.target.value)} />
                <button type="button" className="btn btn-ghost !px-3" aria-label="Choose emoji" aria-expanded={showEmoji}
                  onClick={() => setShowEmoji((visible) => !visible)}><Smile size={19} /></button>
                <button className="btn btn-primary" aria-label="Send" disabled={!text.trim() || a.conn !== "connected"}><Send size={18} /></button>
              </form>
            </div>
            {showMembers && active.kind === "group" && (
              <aside className="absolute inset-0 z-20 flex w-full flex-col overflow-y-auto border-l border-line bg-panel shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(22rem,90vw)] md:static md:w-80 md:shrink-0 md:shadow-none" aria-label="Group information and members">
                <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-panel/95 p-4 backdrop-blur">
                  <Avatar name={active.title} kind="group" imageUrl={active.avatar_url} size={48} />
                  <div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{active.title}</h3>
                    <p className="text-xs text-dim">{active.members.length} members{active.is_admin ? " · Admin" : ""}</p></div>
                  <button type="button" className="btn btn-ghost !min-h-9 !px-2" aria-label="Close group information" onClick={() => setShowMembers(false)}><X size={18} /></button>
                </header>
                {active.description && <p className="border-b border-line px-4 py-3 text-sm text-dim">{active.description}</p>}
                {active.is_admin && <section className="border-b border-line p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-dim">Invite people</h4>
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted" />
                    <input className="field !pl-9" value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="Search users to invite…" aria-label="Search users to invite" />
                  </div>
                  {inviteUsers.length > 0 && <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-line">
                    {inviteUsers.slice(0, 6).map((candidate) => <li key={candidate.id} className="flex items-center gap-2 p-2">
                      <Avatar name={candidate.display_name} imageUrl={candidate.avatar_url} size={32} />
                      <span className="min-w-0 flex-1 truncate text-xs">{candidate.display_name}</span>
                      <button type="button" className="btn btn-ghost !min-h-8 !px-2" aria-label={`Invite ${candidate.display_name}`} disabled={memberBusy === candidate.id}
                        onClick={() => void inviteMember(candidate)}><UserPlus size={15} /></button>
                    </li>)}
                  </ul>}
                </section>}
                <h4 className="px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-dim">Members · {active.members.length}</h4>
                {active.members.map((m) => (
                  <div key={m.id} className="mx-2 mb-1 rounded-xl border border-transparent p-2 hover:border-line hover:bg-elevated">
                    <div className="flex items-center gap-2">
                      <button type="button" className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber"
                        aria-label={`View ${m.display_name}'s profile`} onClick={() => setProfileUserId(m.id)}>
                        <Avatar name={m.display_name} size={40} imageUrl={m.avatar_url} />
                      </button>
                      <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2">
                        <button type="button" className="flex min-w-0 max-w-full items-center gap-1 text-left text-sm font-medium hover:text-amber"
                          onClick={() => setProfileUserId(m.id)}><span className="truncate">{m.display_name}{m.id === a.user?.id ? " (you)" : ""}</span>{m.is_verified && <VerifiedBadge className="h-[14px] w-[14px]" />}</button>
                        {m.is_admin && <span className="shrink-0 text-[10px] text-amber">Group admin</span>}
                        </div><div className="flex items-center gap-2"><Presence online={a.online.has(m.id)} available={a.presenceAvailable} /></div>
                      </div>
                      {m.id !== a.user?.id && <button type="button" className={`btn !min-h-9 !px-2.5 text-xs ${m.is_following ? "btn-ghost" : "btn-primary"}`} disabled={memberBusy === m.id}
                        aria-label={`${m.is_following ? "Unfollow" : "Follow"} ${m.display_name}`} title={m.is_following ? "Unfollow" : "Follow"}
                        onClick={() => void toggleMemberFollow(m)}>{m.is_following ? <UserCheck size={15} /> : <UserPlus size={15} />}{m.is_following ? "Following" : "Follow"}</button>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-1 pl-12">
                      <button type="button" className="min-h-9 rounded-md px-2 text-left text-xs text-dim hover:bg-panel hover:text-amber"
                        onClick={() => void showMemberFollowers(m)}>
                        View {m.follower_count ?? 0} followers
                      </button>
                      {active.is_admin && m.id !== a.user?.id && <div className="flex gap-1">
                        <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs" disabled={memberBusy === m.id}
                          title={m.is_admin ? "Remove admin" : "Make admin"} aria-label={`${m.is_admin ? "Remove admin from" : "Make"} ${m.display_name}`}
                          onClick={() => void changeMemberAdmin(m, !m.is_admin)}>
                          {m.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}{m.is_admin ? "Demote" : "Make admin"}
                        </button>
                        <button type="button" className="btn btn-ghost !min-h-9 !px-2 text-xs text-bad" disabled={memberBusy === m.id}
                          title="Remove from group" aria-label={`Remove ${m.display_name} from group`} onClick={() => void removeMember(m)}>
                          <UserRoundX size={13} />Remove
                        </button>
                      </div>}
                    </div>
                  </div>
                ))}
                {actionNotice && <p role="status" className="px-4 py-2 text-xs text-dim">{actionNotice}</p>}
                <div className="mt-auto border-t border-line p-3">
                  {active.id !== "general" && <button type="button" className="btn btn-ghost w-full justify-center text-bad" disabled={memberBusy === active.id}
                    onClick={() => void leaveActiveGroup()}><LogOut size={16} />Leave group</button>}
                </div>
              </aside>
            )}
          </div>
        </>)}
      </Panel>
      {editingGroupId && editingGroup && <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Edit group details">
        <Panel className="w-full max-w-lg p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Edit group details</h2>
            <button type="button" className="btn btn-ghost !min-h-9 !px-2" aria-label="Close" onClick={() => setEditingGroupId(null)}><X size={18} /></button>
          </div>
          <div className="space-y-4">
            <label className="block text-sm">Group name
              <input className="field mt-1" value={groupTitle} maxLength={64} required
                onChange={(event) => setGroupTitle(event.target.value)} />
            </label>
            <label className="block text-sm">Description
              <textarea className="field mt-1 min-h-24" value={groupDescription} maxLength={500}
                onChange={(event) => setGroupDescription(event.target.value)} />
              <span className="mt-1 block text-right text-xs text-dim">{groupDescription.length}/500</span>
            </label>
            <div className="flex items-center gap-3 rounded-md border border-line bg-elevated/30 p-3">
              <div className="relative">
                <Avatar name={editingGroup.title} kind="group" size={56} imageUrl={editingGroup.avatar_url} />
                <button type="button" className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-line bg-elevated text-ink hover:bg-line"
                  aria-label="Edit group picture" aria-expanded={groupAvatarMenuOpen} disabled={groupAvatarBusy}
                  onClick={() => setGroupAvatarMenuOpen((open) => !open)}><Pencil size={15} /></button>
                {groupAvatarMenuOpen && <div className="absolute left-12 top-12 z-30 min-w-44 rounded-md border border-line bg-sidebar p-1 shadow-xl">
                  <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-elevated"
                    disabled={groupAvatarBusy} onClick={() => { setGroupAvatarMenuOpen(false); groupAvatarInput.current?.click(); }}>
                    <ImagePlus size={15} />{editingGroup.avatar_url ? "Change picture" : "Add picture"}
                  </button>
                  {editingGroup.avatar_url && <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-bad hover:bg-elevated"
                    disabled={groupAvatarBusy} onClick={() => void removeGroupPicture()}>
                    <Trash2 size={15} />Remove picture
                  </button>}
                </div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Group picture</p>
                <p className="text-xs text-dim">{groupAvatarBusy ? "Resizing and uploading picture…" : "Use the pencil to add, change, or remove it. Large images are resized automatically."}</p>
              </div>
              <input ref={groupAvatarInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp"
                disabled={groupAvatarBusy} onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void uploadGroupPicture(file);
                }} />
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingGroupId(null)} disabled={savingGroup}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void saveGroup()}
                disabled={savingGroup || !groupTitle.trim()}>{savingGroup ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        </Panel>
      </div>}
      {memberListTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-3" role="dialog" aria-modal="true" aria-label={`${memberListTarget.display_name}'s followers`}>
        <Panel className="flex max-h-[min(80dvh,38rem)] w-full max-w-sm flex-col overflow-hidden shadow-2xl">
          <header className="flex items-center gap-3 border-b border-line p-4">
            <Avatar name={memberListTarget.display_name} imageUrl={memberListTarget.avatar_url} size={38} />
            <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{memberListTarget.display_name}</h2><p className="text-xs text-dim">Followers</p></div>
            <button type="button" className="btn btn-ghost !min-h-9 !px-2" aria-label="Close followers" onClick={() => setMemberListTarget(null)}><X size={18} /></button>
          </header>
          <div className="overflow-y-auto p-2">
            {memberListError && <p role="alert" className="p-4 text-sm text-bad">{memberListError}</p>}
            {!memberListError && memberFollowers.length === 0 && <p className="p-4 text-center text-sm text-dim">No followers yet.</p>}
            {memberFollowers.map((follower) => <button type="button" key={follower.id} onClick={() => setProfileUserId(follower.id)}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber">
              <Avatar name={follower.display_name} imageUrl={follower.avatar_url} size={38} />
              <div className="min-w-0 flex-1"><p className="flex items-center gap-1 truncate text-sm font-medium">{follower.display_name}{follower.is_verified && <VerifiedBadge className="h-[14px] w-[14px]" />}</p><p className="truncate text-xs text-dim">@{follower.username}</p></div>
              <span className="text-xs text-dim">Profile</span>
            </button>)}
          </div>
        </Panel>
      </div>}
      {profileUserId && <UserProfileDialog userId={profileUserId} onClose={() => setProfileUserId(null)} />}
      {forwarding && <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Forward message">
        <Panel className="w-full max-w-sm p-4"><div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Forward message</h2><button aria-label="Close" onClick={() => setForwarding(null)}><X size={18} /></button></div>
          <p className="mb-3 max-h-20 overflow-hidden text-sm text-dim">{forwarding.text}</p>
          <ul className="max-h-64 overflow-y-auto divide-y divide-line">{a.conversations.filter((c) => c.id !== forwarding.conversation_id).map((c) => (
            <li key={c.id}><button className="w-full py-3 text-left hover:text-amber" onClick={() => {
              a.sendTo(c.id, `Forwarded from ${forwarding.sender_name}:\n${forwarding.text}`); setForwarding(null);
            }}>{c.title}</button></li>
          ))}</ul>
        </Panel>
      </div>}
      {showNew && <NewConversation allowGroups={kind === "group"} onClose={() => setShowNew(false)} />}
    </div>
  );
}
