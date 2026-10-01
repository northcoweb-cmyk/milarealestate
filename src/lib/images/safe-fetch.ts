import dns from "node:dns/promises";
import net from "node:net";

/**
 * Outbound fetch for user-supplied URLs (listing links). Guards against SSRF:
 * only http(s) on standard ports, no private/loopback/link-local addresses (checked on every
 * redirect hop), hard timeouts and byte caps. Set MILA_ALLOW_PRIVATE_FETCH=1 ONLY in tests
 * (ignored in production).
 */
export class FetchBlocked extends Error {
  constructor(public reason: "ssrf" | "robots" | "status" | "type" | "size" | "timeout", message: string) { super(message); }
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    if (mapped) return isPrivateIp(mapped[1]);
    return l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb");
  }
  return true;
}

const allowPrivate = () => process.env.MILA_ALLOW_PRIVATE_FETCH === "1" && process.env.NODE_ENV !== "production";

export async function assertPublicUrl(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchBlocked("ssrf", "Only web links are supported.");
  if (u.username || u.password) throw new FetchBlocked("ssrf", "Links with credentials aren't supported.");
  if (allowPrivate()) return;
  if (u.port && !["80", "443"].includes(u.port)) throw new FetchBlocked("ssrf", "That link uses an unusual port.");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new FetchBlocked("ssrf", "That address isn't a public website.");
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new FetchBlocked("ssrf", "That address isn't a public website."); return; }
  let addrs: { address: string }[];
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new FetchBlocked("status", "I couldn't find that website."); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new FetchBlocked("ssrf", "That address isn't a public website.");
}

export interface SafeResponse { status: number; contentType: string; body: Buffer; finalUrl: string }

export async function safeFetch(url: string, opts: { maxBytes: number; timeoutMs?: number; accept?: string; maxRedirects?: number } ): Promise<SafeResponse> {
  let current = new URL(url);
  const deadline = Date.now() + (opts.timeoutMs ?? 8000);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    await assertPublicUrl(current);
    const left = deadline - Date.now();
    if (left <= 0) throw new FetchBlocked("timeout", "That website took too long to respond.");
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(left), headers: { "user-agent": "MilaBot/1.0 (+https://milarealestate.vercel.app; listing photo preview)", accept: opts.accept ?? "*/*", "accept-language": "en-US,en;q=0.8" } });
    } catch { throw new FetchBlocked("timeout", "I couldn't reach that website."); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current);
      continue;
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len && len > opts.maxBytes) throw new FetchBlocked("size", "That file is too large.");
    const chunks: Buffer[] = []; let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > opts.maxBytes) { await reader.cancel(); throw new FetchBlocked("size", "That file is too large."); }
        chunks.push(Buffer.from(value));
      }
    }
    return { status: res.status, contentType, body: Buffer.concat(chunks), finalUrl: current.toString() };
  }
  throw new FetchBlocked("status", "That link redirects too many times.");
}

/** Minimal robots.txt check for our user agent ("milabot", falling back to "*"). */
export function robotsAllows(robots: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; p: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null, lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (k === "allow" || k === "disallow")) cur.rules.push({ allow: k === "allow", p: v });
  }
  const mine = groups.filter((g) => g.agents.includes("milabot")), star = groups.filter((g) => g.agents.includes("*"));
  const use = mine.length ? mine : star;
  let best: { allow: boolean; len: number } | null = null;
  for (const g of use) for (const r of g.rules) {
    if (!r.p) { continue; }
    const re = new RegExp("^" + r.p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || r.p.length > best.len || (r.p.length === best.len && r.allow))) best = { allow: r.allow, len: r.p.length };
  }
  return best ? best.allow : true;
}
