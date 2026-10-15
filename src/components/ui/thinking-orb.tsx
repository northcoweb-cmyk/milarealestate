"use client";
/* eslint-disable react-hooks/refs -- the runtime reads the latest props through refs from frame callbacks */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The "Mila is thinking" moment: the question you just typed collapses out of the input, flies to the middle of the screen as a ball,
 * unfolds into a dotted orb that cycles through what Mila is doing, then lights up in Mila's colors the instant the answer is ready.
 * The chat then opens with the real answer. Adapted from the Morph Orb component; the answer card is left out because the chat shows the answer.
 */

const COPY = { labels: ["Thinking", "Checking your day", "Looking things up", "Writing it up"], done: "Done" };
type Phase = "launch" | "assemble" | "think" | "resolve" | "done";

export interface OrbOrigin { cx: number; cy: number; w: number; h: number; r: number }
export interface ThinkingOrbProps {
  text: string;
  origin: OrbOrigin;
  /** Runs the real request. Resolves when Mila's answer is saved (its text is not needed here). */
  onSubmit: () => Promise<unknown>;
  /** The orb has finished: open the chat. */
  onDone: () => void;
  /** Animation speed multiplier (higher = quicker). */
  speed?: number;
  /** The shortest the thinking stage lasts, in ms at speed 1. */
  minThinkMs?: number;
}

/* ─────────────────────────── geometry ─────────────────────────── */
const BALL = 56, ORB_D = 112, ORB_R = 56, CANVAS = 160; // the orb forms right where the input was: small, in place, nothing takes over the screen

/* ───────────────────────── math + easing ───────────────────────── */
type Ease = (t: number) => number;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmt = (v: number) => String(Math.round(v * 1e4) / 1e4);
const TAU = Math.PI * 2;

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) return t; const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 40; i++) { const e = sx(t); if (Math.abs(e - x) < 1e-6) break; if (x > e) lo = t; else hi = t; t = (hi - lo) / 2 + lo; }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

const E = { out: cubicBezier(0.22, 1, 0.36, 1), io: cubicBezier(0.65, 0, 0.35, 1), in: cubicBezier(0.4, 0, 1, 1), fly: cubicBezier(0.5, 0, 0.1, 1), grow: cubicBezier(0.3, 0, 0.2, 1) };
const bez = (t: number, p0: number, c: number, p2: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * c + t * t * p2;

/* ───────────────────────── timeline data ───────────────────────── */
interface Track { ch: string; from: number; to: number; t0: number; t1: number; ease?: Ease }
const T = (ch: string, from: number, to: number, t0: number, t1: number, ease: Ease = E.io): Track => ({ ch, from, to, t0, t1, ease });
interface Geo { pw: number; ph: number; pr: number; ox: number; oy: number; dir: number }

/** the input folds into a ball, then opens into the orb, all in the same spot */
const launchTracks = (g: Geo): Track[] => [
  T("w", g.pw, g.pw - 12, 0, 90, E.out),
  T("oInput", 1, 0, 0, 150, E.in),
  T("inScale", 1, 0.6, 0, 150, E.in),
  T("oGlow", 1, 0, 0, 260, E.out),
  T("oAur", 1, 0, 0, 260, E.out),
  T("r", g.pr, 999, 0, 380, E.io), // clamped by the CSS to half the shorter side, so it ends as a perfect circle
  T("w", g.pw - 12, BALL, 90, 440, E.io),
  T("h", g.ph, BALL, 90, 440, E.io),
  T("oPill", 1, 0, 260, 440, E.out),
  T("oBall", 0, 1, 260, 440, E.out),
  T("w", BALL, ORB_D, 440, 700, E.out),
  T("h", BALL, ORB_D, 440, 700, E.out),
];

const ASSEMBLE: Track[] = [
  T("oRing", 1, 0, 0, 260, E.out), T("oBall", 1, 0, 0, 220, E.out),
  T("orb.k", 0, 1, 0, 700, E.out), T("orb.alpha", 0, 1, 0, 700, E.out), T("orb.spin", 0, 0.9, 0, 700, E.out),
  T("orb.pop", 1, 1.05, 0, 360, E.out), T("orb.pop", 1.05, 1, 360, 700, E.io),
  T("sOp", 0, 1, 260, 540, E.out), T("sTy", 6, 0, 260, 540, E.out),
];
/** the answer is ready: the orb sweeps into Mila's colors */
const RESOLVE: Track[] = [
  T("orb.sweep", 0, 1, 0, 600, E.io), T("orb.spin", 0.9, 0.3, 0, 600, E.out), T("orb.gain", 1, 0, 0, 600, E.out),
  T("orb.floor", 0, 0.95, 350, 760, E.out), T("orb.rad", 0, 0.15, 350, 760, E.out),
  T("orb.pop", 1, 1.05, 500, 680, E.out), T("orb.pop", 1.05, 1, 680, 760, E.out),
];
/** the orb and the dim backdrop melt away as the chat opens */
const LEAVE: Track[] = [T("orb.alpha", 1, 0, 0, 260, E.out), T("sOp", 1, 0, 0, 200, E.out)];
/** reduced motion: cross-fades only */
const R_IN: Track[] = [T("oInput", 1, 0, 0, 160, E.out), T("oPill", 1, 0, 0, 160, E.out), T("oGlow", 1, 0, 0, 160, E.out), T("oAur", 1, 0, 0, 160, E.out), T("oRing", 1, 0, 0, 160, E.out), T("orb.alpha", 0, 1, 80, 280, E.out), T("sOp", 0, 1, 80, 280, E.out)];

const INIT: Record<string, number> = {
  oGlow: 1, oPill: 1, oBall: 0, oRing: 1, oInput: 1, inScale: 1, oAur: 1, sOp: 0, sTy: 6, oDisc: 0,
  "orb.k": 0, "orb.alpha": 0, "orb.spin": 0, "orb.pop": 1, "orb.sweep": 0, "orb.vortex": 0, "orb.gain": 1, "orb.floor": 0, "orb.rad": 0,
};

/* ─────────────────────────── async utils ─────────────────────────── */
const ABORT = Symbol("abort");
function sleep(ms: number, sig: AbortSignal) {
  return new Promise<void>((res) => {
    if (sig.aborted) return res();
    let id = 0;
    const onAbort = () => { window.clearTimeout(id); res(); };
    id = window.setTimeout(() => { sig.removeEventListener("abort", onAbort); res(); }, Math.max(0, ms));
    sig.addEventListener("abort", onAbort, { once: true });
  });
}
function abortable<V>(p: Promise<V>, sig: AbortSignal) {
  return new Promise<V | undefined>((res) => {
    if (sig.aborted) return res(undefined);
    const onAbort = () => res(undefined);
    sig.addEventListener("abort", onAbort, { once: true });
    p.then((v) => { sig.removeEventListener("abort", onAbort); res(v); }, () => { sig.removeEventListener("abort", onAbort); res(undefined); });
  });
}

/* ───────────────────────────── dotted orb ───────────────────────────── */
const RINGS = 16;
const DOT_LIST = (() => {
  const rand = mulberry32(7);
  const out: { x: number; y: number; z: number; u: number; seed: number }[] = [];
  for (let k = 0; k < RINGS; k++) {
    const y = 1 - ((k + 0.5) / RINGS) * 2, r = Math.sqrt(1 - y * y), m = Math.max(4, Math.round(30 * r));
    for (let j = 0; j < m; j++) { const a = (j / m) * TAU + k * 0.35; out.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, u: (1 - y) / 2, seed: rand() * 6.283 }); }
  }
  return out;
})();
const N = DOT_LIST.length;
const DX = Float32Array.from(DOT_LIST, (d) => d.x), DY = Float32Array.from(DOT_LIST, (d) => d.y), DZ = Float32Array.from(DOT_LIST, (d) => d.z);
const DU = Float32Array.from(DOT_LIST, (d) => d.u), DS = Float32Array.from(DOT_LIST, (d) => d.seed);

/** Mila violet at rest, a brighter blue-violet when the answer lands (reads on both the day and night sky) */
const G_STEPS = 24, A_STEPS = 48;
const COLORS: string[] = (() => {
  const out: string[] = [];
  for (let gi = 0; gi <= G_STEPS; gi++) {
    const g = gi / G_STEPS;
    const r = Math.round(lerp(120, 86, g)), gg = Math.round(lerp(98, 126, g)), b = Math.round(lerp(236, 255, g));
    for (let ai = 0; ai <= A_STEPS; ai++) out.push(`rgba(${r},${gg},${b},${(ai / A_STEPS).toFixed(3)})`);
  }
  return out;
})();

interface OrbParams { k: number; alpha: number; spin: number; rot: number; sweep: number; pop: number; vortex: number; gain: number; floor: number; rad: number; prog: number }
const ORB_KEYS = ["k", "alpha", "spin", "sweep", "pop", "vortex", "gain", "floor", "rad"] as const;

function createOrb(canvas: HTMLCanvasElement, getSpeed: () => number, isReduced: () => boolean) {
  const P: OrbParams = { k: 0, alpha: 0, spin: 0, rot: 0, sweep: 0, pop: 1, vortex: 0, gain: 1, floor: 0, rad: 0, prog: 0 };
  const ctx = canvas.getContext("2d");
  const lit = new Float32Array(N);
  const SX = new Float32Array(N), SY = new Float32Array(N), SR = new Float32Array(N), SD = new Float32Array(N);
  const SC = new Int16Array(N);
  const pw = [1, 0, 0, 0];
  let time = 0, raf = 0, last = 0, dead = false;
  const reset = () => { Object.assign(P, { k: 0, alpha: 0, spin: 0, rot: 0, sweep: 0, pop: 1, vortex: 0, gain: 1, floor: 0, rad: 0, prog: 0 }); lit.fill(0); pw[0] = 1; pw[1] = 0; pw[2] = 0; pw[3] = 0; time = isReduced() ? 1.2 : 0; };
  reset();
  if (!ctx) return { P, ensure() {}, reset, destroy() {} };

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(CANVAS * dpr); canvas.height = Math.round(CANVAS * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const S = 0.6, CP = Math.cos(0.35), SP = Math.sin(0.35), C0 = CANVAS / 2;

  const draw = (dt: number) => {
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    time += dt; P.rot += P.spin * dt;
    const yaw = P.rot + P.vortex, cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const stepW = dt / 0.35;
    for (let q = 0; q < 4; q++) { const d = (q === P.prog ? 1 : 0) - pw[q]; pw[q] += Math.abs(d) <= stepW ? d : d > 0 ? stepW : -stepW; }
    const decay = Math.exp(-dt / 0.5);
    const h0 = (time * 300) % N, h3 = (time * 480) % N;
    const a1 = time * 0.8, b1 = Math.sin(time * 0.5) * 0.9;
    const f1x = Math.cos(b1) * Math.cos(a1), f1y = Math.sin(b1), f1z = Math.cos(b1) * Math.sin(a1);
    const a2 = time * 0.55 + 2.1, b2 = Math.cos(time * 0.42) * 0.9;
    const f2x = Math.cos(b2) * Math.cos(a2), f2y = Math.sin(b2), f2z = Math.cos(b2) * Math.sin(a2);
    const lat = Math.sin(time * 2.2);
    const swirlK = P.vortex * 1.5;

    for (let n = 0; n < N; n++) {
      const dx = DX[n], dy = DY[n], dz = DZ[n], u = DU[n];
      let pulse = 0;
      if (pw[0] > 0.001) { let dd = Math.abs(n - h0); if (dd > N - dd) dd = N - dd; const v = Math.max(0, 1 - dd / 16); pulse = Math.max(pulse, v * v * pw[0]); }
      if (pw[1] > 0.001) {
        const v1 = Math.max(0, (dx * f1x + dy * f1y + dz * f1z - 0.72) / 0.28), v2 = Math.max(0, (dx * f2x + dy * f2y + dz * f2z - 0.72) / 0.28);
        const v = Math.max(v1, v2); pulse = Math.max(pulse, v * v * pw[1]);
      }
      if (pw[2] > 0.001) { const e = dy - lat; const v = Math.max(0, 1 - (e * e) / 0.02); pulse = Math.max(pulse, v * v * pw[2]); }
      if (pw[3] > 0.001) { let dd = Math.abs(n - h3); if (dd > N - dd) dd = N - dd; const v = Math.max(0, 1 - dd / 22); pulse = Math.max(pulse, v * v * pw[3]); }
      const l = Math.max(lit[n] * decay, pulse * P.gain);
      lit[n] = l;

      const ki = clamp01(P.k * (1 + S) - S * u);
      if (ki <= 0.001) { SC[n] = -1; continue; }
      const eo = E.out(ki), kk = eo * P.pop;
      const x1 = dx * cyw + dz * syw, z1 = -dx * syw + dz * cyw;
      const y2 = dy * CP - z1 * SP, z2 = dy * SP + z1 * CP;
      const f = 2.8 / (2.8 - z2), depth = (z2 + 1) / 2;
      let ox = x1 * ORB_R * kk * f, oy = -y2 * ORB_R * kk * f;
      if (swirlK > 0.001) { const sw = (1 - ki) * swirlK, cc = Math.cos(sw), ss = Math.sin(sw); const tx = ox * cc - oy * ss; oy = ox * ss + oy * cc; ox = tx; }
      const g = clamp01((P.sweep * 1.4 - u) / 0.4);
      let a = 0.1 + 0.035 * Math.sin(DS[n] + time * 1.6) * (1 - g) + 0.32 * depth * depth + 0.75 * l * (1 - g) + g * (0.55 + 0.4 * depth) + 2 * g * (1 - g);
      a = Math.max(a, P.floor * (0.7 + 0.3 * depth));
      if (a > 1) a = 1;
      a *= eo * P.alpha;
      SX[n] = C0 + ox; SY[n] = C0 + oy; SD[n] = depth;
      SR[n] = (1.15 * (0.45 + 0.75 * depth) * f + 0.9 * l + g * 0.25) * (1 + P.rad) * (0.4 + 0.6 * eo);
      const ai = Math.round(a * A_STEPS), gi = Math.round(g * G_STEPS);
      SC[n] = ai <= 0 ? -1 : gi * (A_STEPS + 1) + ai;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let n = 0; n < N; n++) {
        const c = SC[n];
        if (c < 0 || (SD[n] >= 0.5) !== (pass === 1)) continue;
        ctx.fillStyle = COLORS[c]; ctx.beginPath(); ctx.arc(SX[n], SY[n], SR[n], 0, TAU); ctx.fill();
      }
    }
  };
  const frame = (now: number) => {
    raf = 0;
    if (dead) return;
    const dt = isReduced() ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000)) * getSpeed();
    last = now; draw(dt);
    if (P.alpha > 0.002) raf = requestAnimationFrame(frame); else ctx.clearRect(0, 0, CANVAS, CANVAS);
  };
  const ensure = () => { if (raf || dead || P.alpha <= 0.002) return; last = performance.now(); raf = requestAnimationFrame(frame); };
  const destroy = () => { dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; };
  return { P, ensure, reset, destroy };
}

/* ───────────────────────────── runtime ───────────────────────────── */
interface Env {
  root: HTMLElement; actor: HTMLElement; form: HTMLElement; canvas: HTMLCanvasElement; status: HTMLElement;
  origin: OrbOrigin; getSpeed: () => number; isReduced: () => boolean;
  ui: { setPhase(p: Phase): void; swapLabel(name: string): void; live(s: string): void };
}

function createRuntime(env: Env) {
  const { actor, status } = env;
  const life = new AbortController();
  const o = env.origin;
  const geo: Geo = { pw: o.w, ph: o.h, pr: o.r, ox: 0, oy: 0, dir: 1 };
  const orb = createOrb(env.canvas, env.getSpeed, env.isReduced);
  const vals: Record<string, number> = {};
  const dirty = new Set<string>();
  const CH: Record<string, (v: number) => void> = {};

  ["oGlow", "oPill", "oBall", "oRing", "oInput", "oAur", "oDisc"].forEach((n) => { CH[n] = (v) => actor.style.setProperty("--" + n, fmt(v)); });
  ["w", "h", "r"].forEach((n) => { CH[n] = (v) => { actor.style.setProperty("--" + n, fmt(v) + "px"); }; });
  CH.inScale = (v) => { actor.style.setProperty("--inScale", fmt(v)); env.form.style.filter = v >= 0.999 ? "none" : `blur(${fmt((1 - v) * 12)}px)`; };
  CH.sOp = (v) => status.style.setProperty("--sOp", fmt(v));
  CH.sTy = (v) => status.style.setProperty("--sTy", fmt(v));
  ORB_KEYS.forEach((name) => { CH["orb." + name] = (v) => { orb.P[name] = v; if (name === "alpha") { actor.style.setProperty("--oDisc", fmt(v)); orb.ensure(); } }; });

  const set = (ch: string, v: number) => { vals[ch] = v; dirty.add(ch); };
  const flush = () => { dirty.forEach((ch) => CH[ch]?.(vals[ch])); dirty.clear(); };
  const setNow = (ch: string, v: number) => { vals[ch] = v; CH[ch]?.(v); };

  const play = (tracks: Track[], sig: AbortSignal) =>
    new Promise<void>((res) => {
      if (sig.aborted) return res();
      const end = tracks.reduce((m, k) => Math.max(m, k.t1), 0);
      const done = new Set<Track>();
      let raf = 0, t = 0, last = performance.now();
      const onAbort = () => { cancelAnimationFrame(raf); res(); };
      const finish = () => { sig.removeEventListener("abort", onAbort); res(); };
      const step = (now: number) => {
        const dt = Math.max(0, Math.min(100, now - last)); last = now; t += dt * env.getSpeed();
        for (const k of tracks) {
          if (done.has(k) || t < k.t0) continue;
          const p = Math.min(1, (t - k.t0) / Math.max(1, k.t1 - k.t0));
          set(k.ch, k.from + (k.to - k.from) * (k.ease ?? E.io)(p));
          if (p === 1) done.add(k);
        }
        flush();
        if (t >= end) finish(); else raf = requestAnimationFrame(step);
      };
      sig.addEventListener("abort", onAbort, { once: true });
      raf = requestAnimationFrame(step);
    });

  const labelLoop = async (sig: AbortSignal, ctl: { stop: boolean }) => {
    let i = 0;
    for (;;) {
      await sleep(1000 / env.getSpeed(), sig);
      if (sig.aborted || ctl.stop) return;
      i = (i + 1) % COPY.labels.length; orb.P.prog = i % 4; env.ui.swapLabel(COPY.labels[i]);
    }
  };

  const ac = new AbortController();
  life.signal.addEventListener("abort", () => ac.abort(), { once: true });

  // initial state: the pill sits exactly where the input was
  for (const ch of Object.keys(INIT)) setNow(ch, INIT[ch]);
  setNow("w", geo.pw); setNow("h", geo.ph); setNow("r", geo.pr);

  return {
    async run(cfg: { onSubmit: () => Promise<unknown>; minThink: number }) {
      const sig = ac.signal;
      const reduced = env.isReduced();
      const go = async (tracks: Track[]) => { await play(tracks, sig); if (sig.aborted) throw ABORT; };
      try {
        env.ui.setPhase("launch");
        if (!reduced) {
          await go(launchTracks(geo));
          setNow("r", ORB_D / 2);
          env.ui.setPhase("assemble");
          await go(ASSEMBLE);
        } else {
          setNow("w", ORB_D); setNow("h", ORB_D); setNow("r", ORB_D / 2); setNow("orb.k", 1); setNow("orb.spin", 0);
          env.ui.setPhase("assemble");
          await go(R_IN);
        }
        env.ui.setPhase("think");
        env.ui.live(COPY.labels[0]);
        const ctl = { stop: false };
        void labelLoop(sig, ctl);
        const t0 = performance.now();
        await abortable(Promise.resolve().then(cfg.onSubmit).catch(() => undefined), sig);
        if (sig.aborted) throw ABORT;
        await sleep(cfg.minThink / env.getSpeed() - (performance.now() - t0), sig);
        ctl.stop = true;
        if (sig.aborted) throw ABORT;
        env.ui.setPhase("resolve");
        env.ui.swapLabel(COPY.done);
        await go(reduced ? [T("orb.sweep", 0, 1, 0, 200, E.io), T("orb.floor", 0, 0.95, 0, 200, E.out)] : RESOLVE);
        await sleep(160 / env.getSpeed(), sig);
        env.ui.setPhase("done");
        return true;
      } catch (e) {
        if (e === ABORT) return false;
        return false;
      }
    },
    /** fade the orb and backdrop away (the chat is opening) */
    async leave() { await play(LEAVE, new AbortController().signal); },
    abort() { ac.abort(); },
    destroy() { life.abort(); orb.destroy(); },
  };
}

/* ───────────────────────────── component ───────────────────────────── */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ThinkingOrb({ text, origin, onSubmit, onDone, speed = 1.7, minThinkMs = 1100 }: ThinkingOrbProps) {
  const [lbl, setLbl] = useState<{ cur: string; prev: string | null; n: number }>({ cur: COPY.labels[0], prev: null, n: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const actorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(speed);
  speedRef.current = Math.max(0.05, speed);
  const reducedRef = useRef(false);
  const propsRef = useRef({ onSubmit, onDone, minThinkMs });
  propsRef.current = { onSubmit, onDone, minThinkMs };
  const rtRef = useRef<ReturnType<typeof createRuntime> | null>(null);
  const finishedRef = useRef(false);

  useIsoLayoutEffect(() => {
    const root = rootRef.current, actor = actorRef.current, canvas = canvasRef.current, status = statusRef.current, form = formRef.current;
    if (!root || !actor || !canvas || !status || !form) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const rt = createRuntime({
      root, actor, form, status, canvas, origin,
      getSpeed: () => speedRef.current, isReduced: () => reducedRef.current,
      ui: {
        setPhase: (p) => root.setAttribute("data-phase", p),
        swapLabel: (name) => setLbl((l) => (l.cur === name ? l : { cur: name, prev: l.cur, n: l.n + 1 })),
        live: (s) => { if (liveRef.current) liveRef.current.textContent = s; },
      },
    });
    rtRef.current = rt;
    const finish = async () => { if (finishedRef.current) return; finishedRef.current = true; propsRef.current.onDone(); await rt.leave(); };
    void rt.run({ onSubmit: () => propsRef.current.onSubmit(), minThink: propsRef.current.minThinkMs }).then((ok) => { if (ok !== undefined) void finish(); });
    // tap or Escape skips straight to the chat
    const skip = () => { rt.abort(); void finish(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    window.addEventListener("keydown", onKey);
    actor.addEventListener("pointerdown", skip);
    return () => { window.removeEventListener("keydown", onKey); actor.removeEventListener("pointerdown", skip); rt.destroy(); rtRef.current = null; };
  }, []);

  const labelInner = (name: string) => name === COPY.done ? <span className="mo-lab-done">{name}</span> : <><span className="mo-lab-t">{name}</span><span className="mo-dots" aria-hidden="true"><i /><i /><i /></span></>;

  return (
    <div className="mo-root" data-phase="launch" ref={rootRef} role="status" aria-label="Mila is working on your request">
      <div className="mo-mover" style={{ left: origin.cx, top: origin.cy }}>
        <div className="mo-actor" ref={actorRef}>
          <div className="mo-underglow" aria-hidden="true" />
          <div className="mo-surface" aria-hidden="true"><div className="mo-aurora"><i /><i /><i /><i /></div></div>
          <div className="mo-ball" aria-hidden="true" />
          <div className="mo-disc" aria-hidden="true" />
          <div className="mo-ring" aria-hidden="true" />
          <div className="mo-input" ref={formRef}>
            <svg className="mo-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5l1.7 4.8 4.8 1.7-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7L10 3.5z" /><path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" /></svg>
            <span className="mo-field">{text}</span>
            <span className="mo-send" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5" /><path d="M5.5 11.5L12 5l6.5 6.5" /></svg></span>
          </div>
          <canvas className="mo-orb" ref={canvasRef} aria-hidden="true" />
        </div>
        <div className="mo-status" ref={statusRef} aria-hidden="true">
          {lbl.prev !== null && <span key={"p" + lbl.n} className="mo-lab mo-out">{labelInner(lbl.prev)}</span>}
          <span key={"c" + lbl.n} className="mo-lab mo-in">{labelInner(lbl.cur)}</span>
        </div>
      </div>
      <div className="mo-live" ref={liveRef} role="status" aria-live="polite" />
    </div>
  );
}

export default ThinkingOrb;
