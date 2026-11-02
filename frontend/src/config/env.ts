export const WS_NODE_URLS: string[] = (import.meta.env.VITE_WS_NODE_URLS || "ws://localhost:8001/ws,ws://localhost:8002/ws")
  .split(",").map((s: string) => s.trim()).filter(Boolean);
/** ws://host:port/ws -> http://host:port (REST follows the same ordered node list). */
export const API_BASES: string[] = WS_NODE_URLS.map((u) => u.replace(/^ws/, "http").replace(/\/ws$/, ""));
