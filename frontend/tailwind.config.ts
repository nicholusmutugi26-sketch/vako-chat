import type { Config } from "tailwindcss";
// Approved palette only. No gradients, no blue/purple.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: {
    canvas: "#090909", sidebar: "#111111", panel: "#151515", elevated: "#1C1C1C", line: "#292929",
    ink: "#F2F0EA", dim: "#A7A39A", muted: "#8A867D",
    amber: { DEFAULT: "#D9A51F", soft: "#8E6C18" },
    ok: "#39B86A", bad: "#D94B45", warn: "#D7A52B",
  }, fontFamily: { sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"] } } },
  plugins: [],
} satisfies Config;
