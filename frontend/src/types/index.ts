export interface User { id: string; username: string; display_name: string; bio: string }
export interface Member { id: string; display_name: string; username: string }
export interface Conversation {
  id: string; kind: "direct" | "group"; title: string; members: Member[];
  last_text: string | null; last_at: string | null;
}
export interface ChatMessage {
  id: string; conversation_id: string; sender_id: string; sender_name: string;
  text: string; created_at: string; origin_node: string | null;
}
export type ConnState = "connected" | "reconnecting" | "disconnected";
export type ServerFrame =
  | { type: "auth.ok"; node_id: string }
  | { type: "message.created"; event_id: string; message_id: string; conversation_id: string;
      sender: { id: string; display_name: string }; text: string; created_at: string; origin_node: string }
  | { type: "message.ack"; request_id: string; message_id: string; status: "accepted" | "accepted_local_only" }
  | { type: "error"; code: string; request_id?: string }
  | { type: "pong"; ts: number };
export interface NodeStatus {
  node_id: string; status: "online" | "offline"; port: number | null; connections: number | null;
  uptime_s: number | null; last_heartbeat: number | null;
}
export interface ClusterStatus {
  redis: "connected" | "disconnected"; nodes: NodeStatus[]; checked_at: number; answered_by?: string;
  traffic: null | { window: string; series: { minute: number; sent: number; delivered: number }[] };
}
