export const FONT_FAMILIES = {
  Georgia: "Georgia, serif",
  Inter: "Inter, system-ui, sans-serif",
  Arial: "Arial, Helvetica, sans-serif",
  Verdana: "Verdana, Geneva, sans-serif",
  "Trebuchet MS": "'Trebuchet MS', sans-serif",
  "Times New Roman": "'Times New Roman', Times, serif",
  "Courier New": "'Courier New', monospace",
} as const;

export type FontFamily = keyof typeof FONT_FAMILIES;

export function isFontFamily(value: string): value is FontFamily {
  return Object.prototype.hasOwnProperty.call(FONT_FAMILIES, value);
}

export const THEME_FAMILIES = [
  "Graphite",
  "Warm amber",
  "High contrast",
  "Ocean blue",
  "Forest green",
  "Rose",
  "Violet",
] as const;

export type ThemeFamily = (typeof THEME_FAMILIES)[number];

export function isThemeFamily(value: string): value is ThemeFamily {
  return THEME_FAMILIES.some((theme) => theme === value);
}

export function readFontFamily(): FontFamily {
  const saved = localStorage.getItem("vk_font_family");
  return saved && isFontFamily(saved) ? saved : "Georgia";
}

export function readThemeFamily(): ThemeFamily {
  const saved = localStorage.getItem("vk_theme");
  return saved && isThemeFamily(saved) ? saved : "Graphite";
}
