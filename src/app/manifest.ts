import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mila", short_name: "Mila",
    description: "Your AI operations manager for real estate. She connects your calendar, contacts, listings, email and posts, and remembers how you work.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#f0f0f1", theme_color: "#f0f0f1", categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask Mila", url: "/", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Tasks", url: "/tasks" },
      { name: "Calendar", url: "/calendar" },
    ],
  };
}
