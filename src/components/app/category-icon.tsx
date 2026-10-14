import {
  Briefcase, Car, ChefHat, Gamepad2, GraduationCap, HandCoins, HeartPulse, House, Landmark, Lightbulb, PawPrint, Repeat,
  ShoppingBag, ShoppingCart, Sparkles, Tag, TrendingUp, Undo2, Utensils, Plane, Gift, Smartphone, Shirt, Baby, Dumbbell, Fuel,
  Wifi, Bus, Coffee, Wrench,
} from "lucide-react";

export const CATEGORY_ICONS = {
  utensils: Utensils, "shopping-cart": ShoppingCart, "chef-hat": ChefHat, house: House, lightbulb: Lightbulb, car: Car,
  "heart-pulse": HeartPulse, "graduation-cap": GraduationCap, "gamepad-2": Gamepad2, "shopping-bag": ShoppingBag,
  repeat: Repeat, sparkles: Sparkles, "paw-print": PawPrint, landmark: Landmark, tag: Tag, briefcase: Briefcase,
  "hand-coins": HandCoins, "trending-up": TrendingUp, "undo-2": Undo2, plane: Plane, gift: Gift, smartphone: Smartphone,
  shirt: Shirt, baby: Baby, dumbbell: Dumbbell, fuel: Fuel, wifi: Wifi, bus: Bus, coffee: Coffee, wrench: Wrench,
} as const;

export type CategoryIconName = keyof typeof CATEGORY_ICONS;

export function CategoryIcon({ name, color, size = "md" }: { name?: string | null; color?: string | null; size?: "sm" | "md" }) {
  const Icon = CATEGORY_ICONS[(name ?? "tag") as CategoryIconName] ?? Tag;
  const box = size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl";
  return (
    <span className={`flex shrink-0 items-center justify-center ${box}`} style={{ background: `${color ?? "#94A3B8"}1F`, color: color ?? "#64748B" }} aria-hidden>
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}
