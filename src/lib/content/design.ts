/** Palettes for post images. Shared by the server (to pick one) and the canvas renderer (to draw it). */
export interface Palette { key: string; label: string; bg: string; bg2: string; ink: string; soft: string; accent: string; onAccent: string }

export const PALETTES: Palette[] = [
  { key: "noir", label: "Noir", bg: "#0b0b0c", bg2: "#1f1f22", ink: "#f6f4ef", soft: "#a9a7a1", accent: "#f6f4ef", onAccent: "#0b0b0c" },
  { key: "paper", label: "Paper", bg: "#f3efe6", bg2: "#e6dfd0", ink: "#14130f", soft: "#6b665a", accent: "#14130f", onAccent: "#f3efe6" },
  { key: "sand", label: "Sand", bg: "#e8d9c3", bg2: "#d9c4a5", ink: "#2b1d12", soft: "#7a6550", accent: "#2b1d12", onAccent: "#f4e9d8" },
  { key: "forest", label: "Forest", bg: "#13302a", bg2: "#1d4a40", ink: "#f3ead7", soft: "#a9bdb2", accent: "#e9c98a", onAccent: "#13302a" },
  { key: "clay", label: "Clay", bg: "#b9482f", bg2: "#d1634a", ink: "#fff6ea", soft: "#f2c9b8", accent: "#fff6ea", onAccent: "#7d2b19" },
  { key: "sky", label: "Sky", bg: "#dce6ef", bg2: "#c2d3e3", ink: "#10233a", soft: "#546a82", accent: "#10233a", onAccent: "#eef4fa" },
];
export const paletteOf = (key: string | undefined | null) => PALETTES.find((p) => p.key === key) ?? PALETTES[0];

const LISTING: Record<string, string[]> = { just_listed: ["noir", "paper", "forest"], open_house: ["forest", "noir", "sand"], price_improvement: ["clay", "noir"], just_sold: ["forest", "paper", "noir"] };
const EVERGREEN = ["paper", "sand", "noir", "sky", "forest", "clay"];
/** Deterministic but varied: the same category cycles through palettes as you make more posts. */
export function pickTheme(category: string, variant: number): string {
  const list = LISTING[category] ?? EVERGREEN;
  return list[Math.abs(variant) % list.length];
}

export type Format = "portrait" | "story" | "landscape";
export const FORMATS: Record<Format, { w: number; h: number }> = { portrait: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 }, landscape: { w: 1600, h: 900 } };
export const formatFor = (platform: string): Format => (platform === "tiktok" ? "story" : platform === "x" || platform === "linkedin" ? "landscape" : "portrait");
