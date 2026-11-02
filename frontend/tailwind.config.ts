import type { Config } from "tailwindcss";
// Approved palette only. No gradients, no blue/purple.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: {
    canvas: "var(--color-canvas)", sidebar: "var(--color-sidebar)", panel: "var(--color-panel)",
    elevated: "var(--color-elevated)", line: "var(--color-line)",
    ink: "var(--color-ink)", dim: "var(--color-dim)", muted: "var(--color-muted)",
    amber: { DEFAULT: "var(--color-amber)", soft: "var(--color-amber-soft)" },
    ok: "#39B86A", bad: "#D94B45", warn: "#D7A52B",
  }, fontFamily: { sans: ["Georgia", "serif"] } } },
  plugins: [],
} satisfies Config;
