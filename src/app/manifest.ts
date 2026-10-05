import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mila", short_name: "Mila",
    description: "Your real-estate work agent. She runs the tools you already use and remembers every listing.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#f0f0f1", theme_color: "#f0f0f1", categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask Mila", url: "/", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      { name: "Tasks", url: "/tasks" },
      { name: "Calendar", url: "/calendar" },
    ],
  };
}
