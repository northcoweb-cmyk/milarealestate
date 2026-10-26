import { NextResponse } from "next/server";
import { getWho, isAuthed } from "@/lib/auth";
import { table, write } from "@/lib/sb";
import { ensureEntry, sendInvite, smtpConfigured } from "@/lib/invites";
import { PROGRAM, type Creator, activityOf, daysLeft, giveFreeMonth, makePartner, newToken, partnerLink, pausePartnerAccess, profileOf, sendCreatorEmail, statementOf, submitUrl, syncAccess, verifiedCount, type Video, keepPartnerAccess } from "@/lib/creators";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const DAY = 86_400_000;
/** Sarah runs the program day to day. Money and promises (the free month, partner terms, payouts, extending a deadline) stay with Ryan. */
const RYAN_ONLY = new Set(["reward", "extend", "close", "promote", "partner_terms", "pause_partner", "resume_partner", "payout", "delete_any"]);

export async function POST(req: Request) {
  if (!(await isAuthed())) return bad("Not signed in.", 401);
  const who = await getWho();
  if (!who) return bad("Pick who you are first.", 403);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return bad("Bad origin.", 403);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action ?? "");
  if (who !== "ryan" && RYAN_ONLY.has(action)) return bad("That one is Ryan's: it spends money or changes what a creator was promised.", 403);

  if (action === "add") {
    const name = String(b.name ?? "").trim().slice(0, 80), email = String(b.email ?? "").trim().toLowerCase();
    if (name.length < 2) return bad("Add their name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad("Enter their email.");
    const handle = String(b.handle ?? "").trim().replace(/^@?/, "@").slice(0, 60);
    if (handle.length > 1) { const dupe = await table<{ name: string }>("creators", { select: "name", filter: `handle=ilike.${encodeURIComponent(handle)}` }); if (dupe?.length) return bad(`That handle is already on the list as ${dupe[0].name}.`); }
    const row = { name, email, handle: handle.length > 1 ? handle : null, platform: String(b.platform ?? "").trim().slice(0, 20) || null, followers: Number(b.followers) > 0 ? Math.round(Number(b.followers)) : null, notes: String(b.notes ?? "").trim().slice(0, 500) || null, token: newToken(), status: b.stage === "prospect" ? "prospect" : "invited", added_by: who, contacted_at: b.stage === "prospect" ? null : new Date().toISOString() };
    const r = await write<Creator>("creators", "POST", { body: row });
    if (!r?.[0]) return bad("Couldn't save. Is that email already on the list, or is migration 0015_creator_partners.sql not run yet?", 502);
    return NextResponse.json({ ok: true, id: r[0].id, message: `${name} added. Open them to grant access.` });
  }

  const id = String(b.id ?? "");
  const found = id ? await table<Creator>("creators", { select: "*", filter: `id=eq.${encodeURIComponent(id)}` }) : null;
  const c = found?.[0];
  if (!c) return bad("Creator not found.", 404);
  const videos = (await table<Video>("creator_videos", { select: "*", filter: `creator_id=eq.${c.id}` })) ?? [];

  if (action === "contacted") { await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { contacted_at: new Date().toISOString(), status: c.status === "prospect" ? "invited" : c.status } }); return NextResponse.json({ ok: true, message: "Marked as contacted." }); }

  if (action === "grant_access") {
    if (c.status === "active") return bad("They already have access.");
    if (!["prospect", "invited", "expired", "declined"].includes(c.status)) return bad("They're past this step.");
    const active = (await table<{ id: string }>("creators", { select: "id", filter: "status=eq.active" }))?.length ?? 0;
    if (active >= PROGRAM.maxActive) return bad(`${active} creators are already in their window. Wait for some to finish (the cap is ${PROGRAM.maxActive}).`, 409);
    if (!smtpConfigured() && !(await profileOf(c.email))) return bad("Email isn't set up (SMTP), so the sign-in invite can't be sent.");
    const now = new Date(), deadline = new Date(now.getTime() + PROGRAM.windowDays * DAY);
    const r = await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "active", access_at: now.toISOString(), deadline_at: deadline.toISOString(), reminders_sent: 0, closed_note: null, sent: {} } });
    if (!r) return bad("The change didn't save.", 502);
    const next = { ...c, status: "active" as const, access_at: now.toISOString(), deadline_at: deadline.toISOString() };
    let invite = "";
    try { if (!(await profileOf(c.email))) { const e = await ensureEntry(c.email, c.name, "creator"); await sendInvite(e); invite = " Sign-in invite sent."; } } catch (e) { invite = ` The sign-in invite failed (${e instanceof Error ? e.message : "error"}); use Resend sign-in invite.`; }
    const m = await sendCreatorEmail("welcome", next);
    const sync = await syncAccess(next);
    return NextResponse.json({ ok: true, message: `Access granted. Videos due ${deadline.toISOString().slice(0, 10)}.${invite}${m.ok ? " Welcome email sent." : ` Welcome email not sent: ${m.error}`} (${sync})` });
  }

  if (action === "resend_invite") {
    if (await profileOf(c.email)) return bad("They already have a Mila account.");
    try { await sendInvite(await ensureEntry(c.email, c.name, "creator")); } catch (e) { return bad(`Couldn't send: ${e instanceof Error ? e.message : "error"}`, 502); }
    return NextResponse.json({ ok: true, message: "Sign-in invite sent again." });
  }

  if (action === "remind") {
    const partner = c.status === "partner" || c.status === "paused";
    const m = await sendCreatorEmail(partner ? "partner_reminder" : "reminder", c, { left: Math.max(0, partner ? c.videos_per_month : daysLeft(c.deadline_at) ?? 0), done: verifiedCount(videos, c.id) });
    if (!m.ok) return bad(m.error ?? "Email failed.", 502);
    await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { last_reminded_at: new Date().toISOString(), reminders_sent: c.reminders_sent + 1 } });
    return NextResponse.json({ ok: true, message: "Reminder sent." });
  }

  if (action === "extend") {
    const base = Math.max(Date.now(), c.deadline_at ? new Date(c.deadline_at).getTime() : Date.now());
    const end = new Date(base + PROGRAM.extendDays * DAY).toISOString();
    await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { deadline_at: end, status: "active", closed_note: null } });
    await syncAccess({ ...c, status: "active", deadline_at: end });
    return NextResponse.json({ ok: true, message: `Deadline moved to ${end.slice(0, 10)}.` });
  }

  if (action === "reward") {
    const ok = verifiedCount(videos, c.id);
    if (ok < PROGRAM.videosNeeded && b.override !== true) return bad(`Only ${ok}/${PROGRAM.videosNeeded} videos are verified.`);
    const act = await activityOf(c.email, c.access_at);
    if (act.messages < PROGRAM.partner.minUseMessages && b.override !== true) return bad(`They've only sent Mila ${act.messages} message${act.messages === 1 ? "" : "s"} (the bar is ${PROGRAM.partner.minUseMessages}). That is a sign the videos may not be from real use. Check, or confirm to give it anyway.`, 409);
    const g = await giveFreeMonth(c);
    if (!g.ok) return bad(g.message, 409);
    await sendCreatorEmail("reward", c);
    return NextResponse.json({ ok: true, message: g.message });
  }

  if (action === "promote") {
    if (!["rewarded", "active", "expired"].includes(c.status)) return bad("Only creators who finished the first round can become partners.");
    if (verifiedCount(videos, c.id) < PROGRAM.videosNeeded && b.override !== true) return bad("They haven't had 3 videos verified yet.");
    const r = await makePartner(c, { commissionPct: Number(b.commissionPct) || undefined, commissionMonths: Number(b.commissionMonths) || undefined, videosPerMonth: Number(b.videosPerMonth) || undefined });
    if (!r.ok) return bad(r.message, 502);
    const fresh = (await table<Creator>("creators", { select: "*", filter: `id=eq.${c.id}` }))?.[0];
    if (fresh) await sendCreatorEmail("partner", fresh);
    return NextResponse.json({ ok: true, message: r.message });
  }

  if (action === "partner_terms") {
    const pct = Math.min(40, Math.max(5, Math.round(Number(b.commissionPct) || c.commission_pct))), months = Math.min(36, Math.max(1, Math.round(Number(b.commissionMonths) || c.commission_months))), vpm = Math.min(12, Math.max(1, Math.round(Number(b.videosPerMonth) || c.videos_per_month)));
    await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { commission_pct: pct, commission_months: months, videos_per_month: vpm } });
    return NextResponse.json({ ok: true, message: `Terms saved: ${pct}% for ${months} months, ${vpm} video${vpm === 1 ? "" : "s"} a month.` });
  }
  if (action === "pause_partner") { const r = await pausePartnerAccess(c); await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "paused" } }); return NextResponse.json({ ok: true, message: `Paused (${r}).` }); }
  if (action === "resume_partner") { const r = await keepPartnerAccess(c); await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: "partner" } }); return NextResponse.json({ ok: true, message: r }); }

  if (action === "payout") {
    const cents = Math.round(Number(b.amount) * 100), period = String(b.period ?? "");
    if (!/^\d{4}-\d{2}$/.test(period)) return bad("Pick the month the commission is for.");
    if (!Number.isFinite(cents) || cents < 100) return bad("Enter the amount paid (at least $1).");
    const st = await statementOf(c);
    const owed = st.byPeriod.find((x) => x.period === period)?.owedCents ?? 0;
    if (cents > owed + 1 && b.override !== true) return bad(`That's more than the ${(owed / 100).toFixed(2)} owed for ${period}.`, 409);
    const r = await write("partner_payouts", "POST", { body: { creator_id: c.id, period, amount_cents: cents, note: String(b.note ?? "").slice(0, 160) || null } });
    if (!r) return bad("The payout didn't save.", 502);
    return NextResponse.json({ ok: true, message: `Recorded $${(cents / 100).toFixed(2)} paid for ${period}.` });
  }

  if (action === "decline" || action === "close") {
    if (who !== "ryan" && !["prospect", "invited"].includes(c.status)) return bad("Only Ryan can close someone who already has access.", 403);
    await write("creators", "PATCH", { filter: `id=eq.${c.id}`, body: { status: action === "decline" ? "declined" : "expired", closed_note: String(b.note ?? "").slice(0, 200) || null } });
    return NextResponse.json({ ok: true, message: action === "decline" ? "Marked as declined." : "Closed." });
  }

  if (action === "copy_link") return NextResponse.json({ ok: true, message: c.ref_code && b.which === "partner" ? partnerLink(c.ref_code) : submitUrl(c.token) });
  if (action === "delete") {
    if (!["prospect", "invited"].includes(c.status) && who !== "ryan") return bad("Only Ryan can delete someone who already had access.", 403);
    await write("creators", "DELETE", { filter: `id=eq.${c.id}` });
    return NextResponse.json({ ok: true, message: "Deleted." });
  }
  return bad("Unknown action.");
}
