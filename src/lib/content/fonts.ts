/** Headline fonts for post images. Shared by the editor (to list them) and the canvas renderer (to draw them). Each loads through a CSS variable set in the root layout. */
export interface PostFont { key: string; label: string; cssVar: string; weight: number; serif: boolean }

export const POST_FONTS: PostFont[] = [
  { key: "classic", label: "Classic", cssVar: "--font-display", weight: 400, serif: true },
  { key: "playfair", label: "Elegant", cssVar: "--font-playfair", weight: 600, serif: true },
  { key: "cormorant", label: "Luxury", cssVar: "--font-cormorant", weight: 600, serif: true },
  { key: "dmserif", label: "Bold serif", cssVar: "--font-dmserif", weight: 400, serif: true },
  { key: "baskerville", label: "Traditional", cssVar: "--font-baskerville", weight: 700, serif: true },
  { key: "montserrat", label: "Modern", cssVar: "--font-montserrat", weight: 800, serif: false },
  { key: "inter", label: "Clean", cssVar: "--font-inter", weight: 800, serif: false },
  { key: "oswald", label: "Poster", cssVar: "--font-oswald", weight: 600, serif: false },
];
export const fontOf = (key: string | undefined | null) => POST_FONTS.find((f) => f.key === key) ?? POST_FONTS[0];
