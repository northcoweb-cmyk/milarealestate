import { ImageResponse } from "next/og";

// PNG app icons generated at request time (cached): an "M" on a soft sky gradient.
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Math.min(Math.max(parseInt((await params).size) || 192, 48), 1024);
  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  const inner = maskable ? size * 0.5 : size * 0.62;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#8fb4ff 0%,#a68cff 55%,#ffc9a8 100%)", borderRadius: maskable ? 0 : size * 0.225 }}>
        <div style={{ fontSize: inner, fontWeight: 400, color: "white", fontFamily: "Georgia, serif", letterSpacing: -inner * 0.04, lineHeight: 1, marginTop: -inner * 0.06 }}>M</div>
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=31536000, immutable" } },
  );
}
