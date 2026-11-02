import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useApp } from "../context/AppContext";
import { Panel } from "../components/ui";
import { WS_NODE_URLS } from "../config/env";
import { FONT_FAMILIES, THEME_FAMILIES, isFontFamily, isThemeFamily, readFontFamily, readThemeFamily, type FontFamily, type ThemeFamily } from "../config/appearance";

const FONT_SIZES = ["Extra small", "Small", "Normal", "Large", "Extra large"] as const;
const FONT_SIZE_PX: Record<(typeof FONT_SIZES)[number], number> = {
  "Extra small": 12,
  Small: 14,
  Normal: 16,
  Large: 18,
  "Extra large": 20,
};
const readFontSize = () => FONT_SIZES.find((size) => size === localStorage.getItem("vk_font_size")) ?? "Normal";

export default function Settings() {
  const { logout } = useApp();
  const [notify, setNotify] = useState(() => localStorage.getItem("vk_notify") !== "off");
  const [theme, setTheme] = useState<ThemeFamily>(readThemeFamily);
  const [fontSize, setFontSize] = useState(readFontSize);
  const [fontFamily, setFontFamily] = useState<FontFamily>(readFontFamily);
  const [showPreviews, setShowPreviews] = useState(() => localStorage.getItem("vk_show_previews") !== "off");
  const [compactList, setCompactList] = useState(() => localStorage.getItem("vk_compact_list") === "on");
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem("vk_reduce_motion") === "on");
  const [saved, setSaved] = useState(() => ({
    notify: localStorage.getItem("vk_notify") !== "off",
    theme: readThemeFamily(),
    fontSize: readFontSize(),
    fontFamily: readFontFamily(),
    showPreviews: localStorage.getItem("vk_show_previews") !== "off",
    compactList: localStorage.getItem("vk_compact_list") === "on",
    reduceMotion: localStorage.getItem("vk_reduce_motion") === "on",
  }));
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.setProperty("font-size", `${FONT_SIZE_PX[saved.fontSize]}px`);
    document.body.style.fontFamily = FONT_FAMILIES[saved.fontFamily];
    document.documentElement.dataset.theme = saved.theme.toLowerCase().replace(/\s+/g, "-");
  }, [saved]);

  function saveSettings() {
    localStorage.setItem("vk_notify", notify ? "on" : "off");
    localStorage.setItem("vk_theme", theme);
    localStorage.setItem("vk_font_size", fontSize);
    localStorage.setItem("vk_font_family", fontFamily);
    localStorage.setItem("vk_show_previews", showPreviews ? "on" : "off");
    localStorage.setItem("vk_compact_list", compactList ? "on" : "off");
    localStorage.setItem("vk_reduce_motion", reduceMotion ? "on" : "off");
    setSaved({ notify, theme, fontSize, fontFamily, showPreviews, compactList, reduceMotion });
    window.dispatchEvent(new Event("vk-settings-updated"));
    setMessage("Settings saved");
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto px-1 pb-4 sm:px-2">
      <Panel className="min-h-full w-full overflow-hidden">
        <header className="border-b border-line bg-elevated/40 px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-dim">Personalize how Vakochat looks and how conversations appear.</p>
        </header>
        <div className="grid gap-3 p-3 sm:gap-4 sm:p-5 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-elevated/20 p-4">
          <h3 className="font-medium">Notifications</h3>
          <p className="mb-2 mt-1 text-xs text-dim">Choose which conversation alerts appear in the app.</p>
          <label className="flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm hover:bg-elevated">
            <input type="checkbox" className="accent-amber" checked={notify}
              onChange={(e) => { setNotify(e.target.checked); setMessage(null); }} />
            Show unread message counts
          </label>
        </section>
        <section className="rounded-lg border border-line bg-elevated/20 p-4">
          <h3 className="font-medium">Conversation list</h3>
          <p className="mb-2 mt-1 text-xs text-dim">Control message previews and list density.</p>
          <label className="flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm hover:bg-elevated">
            <input type="checkbox" className="accent-amber" checked={showPreviews}
              onChange={(e) => { setShowPreviews(e.target.checked); setMessage(null); }} />
            Show latest message previews
          </label>
          <label className="flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm hover:bg-elevated">
            <input type="checkbox" className="accent-amber" checked={compactList}
              onChange={(e) => { setCompactList(e.target.checked); setMessage(null); }} />
            Use compact conversation list
          </label>
        </section>
        <section className="rounded-lg border border-line bg-elevated/20 p-4 md:col-span-2">
          <h3 className="font-medium">Appearance</h3>
          <p className="mb-3 mt-1 text-xs text-dim">Adjust the theme, typeface, and text scale across the app.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm">Color theme
              <select className="field mt-1" value={theme} onChange={(e) => {
                if (isThemeFamily(e.target.value)) { setTheme(e.target.value); setMessage(null); }
              }}>
                {THEME_FAMILIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block text-sm">Font family
              <select className="field mt-1" value={fontFamily} onChange={(e) => {
                if (isFontFamily(e.target.value)) { setFontFamily(e.target.value); setMessage(null); }
              }}>
                {(Object.keys(FONT_FAMILIES) as FontFamily[]).map((family) =>
                  <option key={family} value={family}>{family}</option>)}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-1">
              <span className="flex items-center justify-between">
                <span>Text size</span><span className="text-xs text-dim">{fontSize} · {FONT_SIZE_PX[fontSize]} px</span>
              </span>
              <input className="mt-3 w-full accent-amber" type="range" min={0} max={FONT_SIZES.length - 1} step={1}
                value={FONT_SIZES.indexOf(fontSize)}
                aria-label="Site-wide text size"
                onChange={(e) => { setFontSize(FONT_SIZES[Number(e.target.value)]); setMessage(null); }} />
              <span className="mt-1 flex justify-between text-[11px] text-dim"><span>Extra small</span><span>Extra large</span></span>
            </label>
          </div>
          <label className="mt-3 flex min-h-[44px] items-center gap-3 rounded-md px-2 text-sm hover:bg-elevated">
            <input type="checkbox" className="accent-amber" checked={reduceMotion}
              onChange={(e) => { setReduceMotion(e.target.checked); setMessage(null); }} />
            Reduce animations and motion
          </label>
        </section>
        <section className="rounded-lg border border-line bg-elevated/20 p-4">
          <h3 className="font-medium">Privacy &amp; security</h3>
          <p className="mt-2 text-sm leading-relaxed text-dim">Your session token stays in this browser tab and is cleared when it closes. Passwords are hashed before storage.</p>
        </section>
        <section className="rounded-lg border border-line bg-elevated/20 p-4">
          <h3 className="font-medium">Connection</h3>
          <p className="mt-2 text-sm text-dim">Configured server nodes</p>
          <p className="mt-1 break-all text-xs leading-relaxed text-muted">{WS_NODE_URLS.join(", ")}</p>
        </section>
        </div>
        <footer className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-line bg-panel/95 px-3 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5">
          {message && <p className="text-sm text-dim" role="status">{message}</p>}
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
          <button className="btn btn-ghost w-full sm:w-auto" onClick={logout}>Sign out</button>
          <button className="btn btn-primary w-full sm:w-auto" onClick={saveSettings}
            disabled={saved.notify === notify && saved.theme === theme && saved.fontSize === fontSize &&
              saved.fontFamily === fontFamily && saved.showPreviews === showPreviews &&
              saved.compactList === compactList && saved.reduceMotion === reduceMotion}>
            <Save size={16} />Save settings
          </button>
          </div>
        </footer>
      </Panel>
    </div>
  );
}
