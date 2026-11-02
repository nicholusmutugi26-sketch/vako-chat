import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, CheckCheck, Copy, Forward, ImagePlus, Info, MoreHorizontal, Pencil, Plus, Reply, Search, Send, Smile, Trash2, Users, X } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Avatar, ConnectionBadge, EmptyState, Panel, Presence } from "../components/ui";
import NewConversation from "../components/NewConversation";
import type { ChatMessage } from "../types";

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
const EmojiPicker = lazy(() => import("emoji-picker-react"));
export default function Messages({ kind }: { kind: "all" | "group" }) {
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
  const input = useRef<HTMLInputElement>(null);
  const groupAvatarInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const lastTypingSent = useRef(0);
  const list = a.conversations
    .filter((c) => (kind === "all" || c.kind === "group") && c.title.toLowerCase().includes(q.toLowerCase()))
    .sort((left, right) => (Date.parse(right.last_at ?? "") || 0) - (Date.parse(left.last_at ?? "") || 0));
  const active = a.conversations.find((c) => c.id === a.activeId) ?? null;
  const editingGroup = a.conversations.find((conversation) => conversation.id === editingGroupId && conversation.kind === "group");
  const msgs = (active && a.messages[active.id]) || [];
  useEffect(() => {
    const updatePreferences = () => {
      setShowUnreadCounts(localStorage.getItem("vk_notify") !== "off");
      setShowPreviews(localStorage.getItem("vk_show_previews") !== "off");
      setCompactList(localStorage.getItem("vk_compact_list") === "on");
    };
    window.addEventListener("vk-settings-updated", updatePreferences);
    return () => window.removeEventListener("vk-settings-updated", updatePreferences);
  }, []);
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
    if (!active || active.kind !== "group") return;
    setGroupTitle(active.title);
    setGroupDescription(active.description);
  }, [active?.id, active?.title, active?.description]);
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
  return (
    <div className="flex h-full min-h-0 gap-3">
      {/* conversation column: hidden on mobile when a chat is open */}
      <Panel className={`${active ? "hidden md:flex" : "flex"} flex-col w-full md:w-72 shrink-0 min-h-0`}>
        <div className="p-3 flex items-center justify-between">
          <h2 className="font-semibold">{kind === "group" ? "Groups" : "Conversations"}</h2>
          <button className="btn btn-ghost !px-2" aria-label="New conversation" onClick={() => setShowNew(true)}><Plus size={18} /></button>
        </div>
        <div className="px-3 pb-2 relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-5 top-3 text-muted" />
          <input className="field !pl-12" placeholder="Search conversations…" aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.length === 0 && <EmptyState text="No conversations" />}
          {list.map((c) => {
            const lastMessageIsMine = c.last_message_sender_id === a.user?.id;
            const lastMessageStatus = c.last_message_status ?? "sent";
            const typingUsers = a.typing[c.id] ?? [];
            return <li key={c.id} className="border-b border-line">
              <button onClick={() => a.select(c.id)} aria-current={c.id === a.activeId}
                className={`w-full text-left flex gap-3 items-center ${compactList ? "p-2 min-h-[48px]" : "p-3 min-h-[56px]"} ${c.id === a.activeId ? "bg-elevated border-l-2 border-amber" : "hover:bg-elevated border-l-2 border-transparent"}`}>
                <Avatar name={c.title} imageUrl={c.kind === "direct" ? c.members.find((m) => m.id !== a.user?.id)?.avatar_url : c.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><span className="truncate font-medium">{c.title}</span><span className="text-xs text-muted">{hhmm(c.last_at)}</span></div>
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
      </Panel>

      <Panel className={`${active ? "flex" : "hidden md:flex"} flex-col flex-1 min-w-0 min-h-0`}>
        {!active ? <EmptyState text="Select a conversation" /> : (<>
          <header className="p-3 border-b border-line flex items-center gap-3">
            <button className="md:hidden btn btn-ghost !px-2" aria-label="Back" onClick={() => a.select(null)}><ArrowLeft size={18} /></button>
            <Avatar name={active.title} imageUrl={active.kind === "direct" ? active.members.find((m) => m.id !== a.user?.id)?.avatar_url : active.avatar_url} />
            <div className="min-w-0 flex-1"><h2 className="font-semibold truncate">{active.title}</h2>
              <p className="truncate text-xs text-dim">{active.kind === "group"
                ? active.description || `${active.members.length} members · Group`
                : "Direct message"}</p></div>
            <ConnectionBadge state={a.conn} />
            {active.kind === "group" && <>
              <button className="btn btn-ghost !px-2" aria-label="Edit group details" title="Edit group details"
                onClick={() => { setGroupTitle(active.title); setGroupDescription(active.description); setEditingGroupId(active.id); }}>
                <Pencil size={17} />
              </button>
              <button className="btn btn-ghost !px-2" aria-label="Members" onClick={() => setShowMembers((s) => !s)}><Users size={18} /></button>
            </>}
          </header>
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
                {msgs.length === 0 && <EmptyState text="No messages yet. Say hello." />}
                {msgs.map((m) => {
                  const mine = m.sender_id === a.user?.id;
                  const rawStatus = mine ? (a.messageStatus[m.id] ?? m.status ?? "sent") : undefined;
                  const editAge = clock - Date.parse(m.created_at);
                  const canEdit = mine && editAge >= 0 && editAge <= 5 * 60 * 1000;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`relative max-w-[80%] rounded-lg px-3 py-2 border ${mine ? "bg-amber-soft/30 border-amber-soft" : "bg-elevated border-line"}`}>
                        <div className="flex items-center gap-3 text-xs text-dim mb-0.5">
                          <span>{mine ? "You" : m.sender_name} · {hhmm(m.created_at)}</span>
                          <button className="rounded p-1 hover:bg-line" aria-label="Message options" title="Message options"
                            onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}><MoreHorizontal size={16} /></button>
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
              <form onSubmit={submit} className="relative flex gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {showEmoji && <div className="absolute bottom-full right-14 z-20 mb-2 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line shadow-xl">
                  <Suspense fallback={<div className="grid h-[400px] w-[min(350px,calc(100vw-2rem))] place-items-center bg-sidebar text-sm text-dim">Loading emojis…</div>}>
                    <EmojiPicker theme="dark" onEmojiClick={(emoji) => insertEmoji(emoji.emoji)}
                      previewConfig={{ showPreview: false }} width={Math.min(350, window.innerWidth - 32)} height={400} />
                  </Suspense>
                </div>}
                <input ref={input} className="field flex-1" placeholder={replyTo ? `Reply to ${replyTo.sender_name}…` : "Type a message…"} aria-label="Message" value={text}
                  maxLength={4000 - replyPrefix.length} onChange={(e) => changeText(e.target.value)} />
                <button type="button" className="btn btn-ghost !px-3" aria-label="Choose emoji" aria-expanded={showEmoji}
                  onClick={() => setShowEmoji((visible) => !visible)}><Smile size={19} /></button>
                <button className="btn btn-primary" aria-label="Send" disabled={!text.trim() || a.conn !== "connected"}><Send size={18} /></button>
              </form>
            </div>
            {showMembers && active.kind === "group" && (
              <aside className="w-56 border-l border-line overflow-y-auto absolute md:static right-0 bg-panel h-full md:h-auto z-10 md:z-auto" aria-label="Group members">
                <h3 className="p-3 font-semibold text-sm">Members ({active.members.length})</h3>
                {active.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2"><Avatar name={m.display_name} size={32} imageUrl={m.avatar_url} />
                    <div className="min-w-0"><p className="truncate text-sm">{m.display_name}</p><Presence online={a.online.has(m.id)} available={a.presenceAvailable} /></div></div>
                ))}
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
                <Avatar name={editingGroup.title} size={56} imageUrl={editingGroup.avatar_url} />
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
      {showNew && <NewConversation onClose={() => setShowNew(false)} />}
    </div>
  );
}
