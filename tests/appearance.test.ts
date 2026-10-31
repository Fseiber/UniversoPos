import test from "node:test";
import assert from "node:assert/strict";
import {
  appearanceTokens,
  accentPresets,
  contrastRatio,
  defaultAccent,
  normalizeAccent,
} from "../src/appearance.js";
test("Apariencia · colores elegidos conservan contraste en ambos temas, incluso extremos", () => {
  const colors = [
    ...accentPresets.map((p) => p.color),
    "#ffffff",
    "#000000",
    "#ffff00",
    "#00ff00",
    "#777777",
    "#ff00ff",
    "#00ffff",
    "#fefefe",
    "#010101",
  ];
  for (let r = 0; r <= 255; r += 51)
    for (let g = 0; g <= 255; g += 51)
      for (let b = 0; b <= 255; b += 51)
        colors.push(
          "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join(""),
        );
  for (const color of colors)
    for (const dark of [false, true]) {
      const t = appearanceTokens(color, dark);
      const pairs = [
        ["--ink", "--bg"],
        ["--ink", "--surface"],
        ["--ink", "--soft"],
        ["--muted", "--surface"],
        ["--muted", "--bg"],
        ["--muted", "--soft"],
        ["--accent-contrast", "--green"],
        ["--accent-contrast", "--accent-hover"],
        ["--accent-text", "--surface"],
        ["--accent-text", "--bg"],
        ["--accent-text", "--soft"],
        ["--accent-soft-text", "--soft"],
        ["--sidebar-ink", "--sidebar"],
        ["--sidebar-muted", "--sidebar"],
        ["--sidebar-accent", "--sidebar"],
        ["--nav-active-text", "--nav-active"],
        ["--red", "--danger-soft"],
        ["--amber", "--warning-soft"],
      ];
      for (const [fg, bg] of pairs)
        assert.ok(
          contrastRatio(t[fg], t[bg]) >= 4.5,
          `${color} ${dark ? "oscuro" : "claro"} ${fg}/${bg}`,
        );
    }
  assert.equal(normalizeAccent("#FF00AA"), "#ff00aa");
  assert.equal(normalizeAccent("red; color: white"), defaultAccent);
  assert.equal(normalizeAccent(null), defaultAccent);
});
