export const defaultAccent = "#2c624b";
export const accentPresets = [
  { name: "Verde", color: defaultAccent },
  { name: "Azul", color: "#2563eb" },
  { name: "Violeta", color: "#7c3aed" },
  { name: "Turquesa", color: "#0f766e" },
  { name: "Naranja", color: "#c2410c" },
  { name: "Rosa", color: "#be185d" },
  { name: "Rojo", color: "#b91c1c" },
  { name: "Gris", color: "#475569" },
];
export const normalizeAccent = (value: unknown) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : defaultAccent;
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function mix(a: string, b: string, weight: number) {
  const aa = rgb(a),
    bb = rgb(b);
  return (
    "#" +
    aa
      .map((v, i) =>
        Math.round(v * (1 - weight) + bb[i] * weight)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function luminance(hex: string) {
  return rgb(hex)
    .map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrastRatio(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableColor(
  seed: string,
  backgrounds: string | string[],
  minimum = 4.5,
) {
  const surfaces =
    typeof backgrounds === "string" ? [backgrounds] : backgrounds;
  const target =
    contrastRatio("#000000", surfaces[0]) >
    contrastRatio("#ffffff", surfaces[0])
      ? "#000000"
      : "#ffffff";
  for (let i = 0; i <= 100; i++) {
    const candidate = mix(seed, target, i / 100);
    if (surfaces.every((bg) => contrastRatio(candidate, bg) >= minimum))
      return candidate;
  }
  return target;
}
export function appearanceTokens(
  accent: string,
  dark: boolean,
): Record<string, string> {
  const color = normalizeAccent(accent),
    bg = dark ? "#101720" : "#f5f6f8",
    surface = dark ? "#1b2532" : "#ffffff",
    elevated = dark ? "#151e29" : "#edf1f5";
  const onAccent =
    contrastRatio("#ffffff", color) >= 4.5 ? "#ffffff" : "#000000";
  const soft = mix(color, dark ? "#182332" : "#ffffff", dark ? 0.78 : 0.9);
  const sidebar = mix(color, "#0b1220", 0.85),
    navActive = mix(color, "#ffffff", 0.8);
  return {
    "--bg": bg,
    "--surface": surface,
    "--elevated": elevated,
    "--ink": dark ? "#f1f5f9" : "#18212f",
    "--muted": readableColor(dark ? "#b4bfce" : "#566477", [
      bg,
      surface,
      elevated,
      soft,
    ]),
    "--border": dark ? "#3a4758" : "#d6dee8",
    "--green": color,
    "--accent-contrast": onAccent,
    "--accent-text": readableColor(color, [bg, surface, elevated, soft]),
    "--accent-hover": mix(
      color,
      onAccent === "#ffffff" ? "#000000" : "#ffffff",
      0.13,
    ),
    "--soft": soft,
    "--accent-soft-text": readableColor(color, soft),
    "--sidebar": sidebar,
    "--sidebar-ink": "#e2e8f0",
    "--sidebar-muted": "#b4bfce",
    "--sidebar-accent": readableColor(color, sidebar),
    "--nav-active": navActive,
    "--nav-active-text": readableColor(color, navActive),
    "--red": dark ? "#ff9da8" : "#ad2336",
    "--amber": dark ? "#f2cf82" : "#795017",
    "--danger-soft": dark ? "#42212a" : "#fff0f2",
    "--warning-soft": dark ? "#3d321d" : "#fff3d6",
    "--shadow": dark ? "0 16px 60px #00000055" : "0 16px 60px #10203020",
  };
}
export function applyAppearance(
  root: HTMLElement,
  accent: string,
  dark: boolean,
) {
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  for (const [key, value] of Object.entries(appearanceTokens(accent, dark)))
    root.style.setProperty(key, value);
}
