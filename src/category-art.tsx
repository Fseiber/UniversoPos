import {
  Wheat,
  GlassWater,
  Wine,
  Cookie,
  Candy,
  Popcorn,
  Milk,
  Beef,
  Croissant,
  UtensilsCrossed,
  Snowflake,
  SprayCan,
  Bath,
  Dog,
  Coffee,
  CookingPot,
  Flame,
  ShoppingBasket,
} from "lucide-react";
import { readableColor } from "./appearance";
const art = [
  [/alcohol/, Wine, "#844f75", "#f0dfed"],
  [/bebida/, GlassWater, "#337c9b", "#dceef5"],
  [/gallet/, Cookie, "#a26730", "#f9e9cd"],
  [/golos/, Candy, "#b15e83", "#f7e0eb"],
  [/snack/, Popcorn, "#aa7130", "#fff0cb"],
  [/lact|láct/, Milk, "#547ca4", "#e0edf8"],
  [/fiambre|queso/, Beef, "#a65f51", "#f3e0d7"],
  [/panad/, Croissant, "#a97834", "#f5e8c9"],
  [/pasta/, UtensilsCrossed, "#9e733e", "#f1e7cd"],
  [/carne|congel/, Snowflake, "#527f9b", "#dceef3"],
  [/limpieza/, SprayCan, "#4b8a86", "#d8efea"],
  [/higiene/, Bath, "#9275a6", "#eee3f4"],
  [/mascota/, Dog, "#8a6d50", "#eee4d6"],
  [/infusion|infusión/, Coffee, "#6d7d4b", "#e7edda"],
  [/bazar/, CookingPot, "#737c93", "#e4e8f2"],
  [/gas/, Flame, "#b66d39", "#fae5d5"],
  [/almac/, Wheat, "#6f884c", "#e7edd6"],
] as const;
export function categoryTheme(category: string) {
  const [, Icon, ink, paper] = art.find(([pattern]) =>
    pattern.test(
      category
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    ),
  ) ?? [null, ShoppingBasket, "#678371", "#e2ece2"];
  return { Icon, ink, paper, text: readableColor(ink, paper) };
}
export function CategoryArt({ category }: { category: string }) {
  const { Icon, ink, paper } = categoryTheme(category);
  return (
    <svg
      className="category-art"
      viewBox="0 0 170 112"
      role="img"
      aria-label={`Imagen de ${category}`}
    >
      <ellipse cx="85" cy="99" rx="57" ry="7" fill={ink} opacity=".12" />
      <path
        d="M33 67C16 28 54 6 86 15c34-17 72 13 52 49 17 30-23 41-50 32-29 14-71 0-55-29Z"
        fill={paper}
      />
      <circle cx="132" cy="24" r="6" fill={ink} opacity=".22" />
      <circle cx="28" cy="80" r="4" fill={ink} opacity=".2" />
      <path
        d="m32 30 4 4m0-4-4 4m105 48 5 5m0-5-5 5"
        stroke={ink}
        strokeWidth="2"
        opacity=".4"
        strokeLinecap="round"
      />
      <Icon
        x="52"
        y="24"
        width="66"
        height="66"
        stroke={ink}
        strokeWidth="1.5"
        fill="white"
      />
    </svg>
  );
}
