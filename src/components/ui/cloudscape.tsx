"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Cloudscape (21st.dev), adapted for Mila's live sky:
 *  - init once; color/speed changes flow through refs (no GL teardown, no time jump)
 *  - colors ease toward their targets, so minute-by-minute sky changes are imperceptible
 *  - optional 3-stop sky gradient behind the clouds + a coverage control
 *  - battery-friendly: reduced render scale, capped fps, pauses when the tab is hidden,
 *    renders a single still frame when `paused` (reduced motion)
 *  - falls back silently (transparent canvas) if WebGL is unavailable or the context is lost
 */

const vertexShaderGLSL = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShaderGLSL = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_colorBottom;   // sky at the horizon (also base sky colour)
uniform vec3 u_colorMid;      // cloud body
uniform vec3 u_colorTop;      // cloud highlights
uniform vec3 u_skyMid;
uniform vec3 u_skyTop;
uniform float u_speed;
uniform float u_cover;        // 0 = overcast … 0.3 = a few wisps

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p, float t) {
  float v = 0.0;
  float a = 0.5;
  float fi = 0.0;
  mat2 rot = mat2(0.86, 0.51, -0.51, 0.86);
  for (int i = 0; i < 5; i++) {
    vec2 morph = vec2(sin(t * 0.5 + fi), cos(t * 0.3 - fi)) * 0.05;
    v += a * noise(p + morph);
    p = rot * p * 2.0;
    a *= 0.5;
    fi += 1.0;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float t = u_time * u_speed;
  vec2 aspect = vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  vec2 p = (uv - 0.5) * aspect;

  vec2 wind = vec2(t * 0.1, t * 0.02);
  float pattern = fbm(p * 2.2 - wind, t);

  float bandLow = smoothstep(0.30 + u_cover, 0.65 + u_cover, pattern);
  float bandHigh = smoothstep(0.70 + u_cover, 0.95 + u_cover, pattern);

  vec3 sky = uv.y < 0.5
    ? mix(u_colorBottom, u_skyMid, uv.y * 2.0)
    : mix(u_skyMid, u_skyTop, (uv.y - 0.5) * 2.0);

  vec3 color = mix(sky, u_colorMid, bandLow);
  color = mix(color, u_colorTop, bandHigh);

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface CloudscapeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Sky colour at the horizon. */
  colorBottom?: string;
  /** Cloud body colour. */
  colorMid?: string;
  /** Cloud highlight colour. */
  colorTop?: string;
  /** Optional sky gradient above the horizon (defaults to a flat colorBottom sky). */
  skyMid?: string;
  skyTop?: string;
  /** 0 (heavy cloud) … 0.3 (few wisps). */
  coverage?: number;
  speed?: number;
  height?: string;
  /** Render scale relative to CSS pixels (0.25–1). Lower is cheaper; clouds are soft so 0.5 looks identical. */
  renderScale?: number;
  /** Frame-rate cap. */
  fps?: number;
  /** Draw a still frame instead of animating (e.g. prefers-reduced-motion). */
  paused?: boolean;
}

const DEFAULT_COLOR = "#0d1117";
const COLOR_HEX_PATTERN = /^#?[0-9a-fA-F]{6}$/;

function normalizeHexColor(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!COLOR_HEX_PATTERN.test(trimmed)) return fallback;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

function hexToRgbNormalized(hex: string): [number, number, number] {
  const n = normalizeHexColor(hex, DEFAULT_COLOR).replace("#", "");
  return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255];
}

type Vec3 = [number, number, number];

const Cloudscape = ({
  colorBottom = "#87ceeb",
  colorMid = "#f8f8f8",
  colorTop = "#ffffff",
  skyMid,
  skyTop,
  coverage = 0,
  speed = 1,
  height = "100vh",
  renderScale = 0.5,
  fps = 30,
  paused = false,
  className,
  style,
  children,
  ...props
}: CloudscapeProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Latest props, read inside the render loop (so changing them never re-creates the GL context).
  const live = useRef({ colorBottom, colorMid, colorTop, skyMid: skyMid ?? colorBottom, skyTop: skyTop ?? skyMid ?? colorBottom, coverage, speed, paused, fps, renderScale });
  const dirty = useRef(true);
  const kick = useRef<() => void>(() => {});
  useEffect(() => {
    live.current = { colorBottom, colorMid, colorTop, skyMid: skyMid ?? colorBottom, skyTop: skyTop ?? skyMid ?? colorBottom, coverage, speed, paused, fps, renderScale };
    dirty.current = true;
    kick.current();
  }, [colorBottom, colorMid, colorTop, skyMid, skyTop, coverage, speed, paused, fps, renderScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: true, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) return; // caller's CSS gradient remains visible

    const compile = (type: number, source: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, vertexShaderGLSL);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShaderGLSL);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const posLoc = gl.getAttribLocation(program, "position");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const U = (n: string) => gl.getUniformLocation(program, n);
    const uRes = U("u_resolution"), uTime = U("u_time"), uBottom = U("u_colorBottom"), uMid = U("u_colorMid"), uTop = U("u_colorTop");
    const uSkyMid = U("u_skyMid"), uSkyTop = U("u_skyTop"), uSpeed = U("u_speed"), uCover = U("u_cover");
    if (!uRes || !uTime || !uBottom || !uMid || !uTop || !uSkyMid || !uSkyTop || !uSpeed || !uCover) return;

    // Size the canvas once, and only again if the WIDTH changes or the height grows a lot. Mobile browsers
    // resize the viewport a few dozen px every time the address bar slides away while scrolling; re-allocating
    // the canvas then (which clears it) is what made the sky flash.
    let lastW = 0, lastH = 0;
    const resize = () => {
      const scale = Math.min(Math.max(live.current.renderScale, 0.25), 1);
      const dpr = Math.min(window.devicePixelRatio || 1, 2) * scale;
      const { width, height } = host.getBoundingClientRect();
      if (lastW && Math.abs(width - lastW) < 2 && height < lastH * 1.25 && height > lastH * 0.6) return;
      lastW = width; lastH = height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      dirty.current = true;
      redrawNow.current(); // redraw in the same task so the cleared canvas is never painted
    };
    const redrawNow = { current: () => {} };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // current colours ease toward targets
    const cur: Record<"b" | "m" | "t" | "sm" | "st", Vec3 | null> = { b: null, m: null, t: null, sm: null, st: null };
    let cover = live.current.coverage;
    const ease = (c: Vec3 | null, target: Vec3, k: number): Vec3 => (c ? [c[0] + (target[0] - c[0]) * k, c[1] + (target[1] - c[1]) * k, c[2] + (target[2] - c[2]) * k] : target);

    let raf = 0, last = 0, running = true, lostCtx = false;
    const t0 = performance.now() - 25_000; // start mid-drift so a still frame already looks like clouds
    let frozenAt = 0;

    const draw = (now: number) => {
      const L = live.current;
      const k = L.paused ? 1 : 0.04;
      cur.b = ease(cur.b, hexToRgbNormalized(L.colorBottom), k);
      cur.m = ease(cur.m, hexToRgbNormalized(L.colorMid), k);
      cur.t = ease(cur.t, hexToRgbNormalized(L.colorTop), k);
      cur.sm = ease(cur.sm, hexToRgbNormalized(L.skyMid), k);
      cur.st = ease(cur.st, hexToRgbNormalized(L.skyTop), k);
      cover += (L.coverage - cover) * k;
      const t = L.paused ? (frozenAt ||= now - t0) / 1000 : (now - t0) / 1000;
      gl.uniform1f(uTime, t);
      gl.uniform3f(uBottom, ...(cur.b as Vec3));
      gl.uniform3f(uMid, ...(cur.m as Vec3));
      gl.uniform3f(uTop, ...(cur.t as Vec3));
      gl.uniform3f(uSkyMid, ...(cur.sm as Vec3));
      gl.uniform3f(uSkyTop, ...(cur.st as Vec3));
      gl.uniform1f(uSpeed, L.speed);
      gl.uniform1f(uCover, cover);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    redrawNow.current = () => { if (!document.hidden && !lostCtx) { dirty.current = false; draw(performance.now()); } };
    redrawNow.current();

    // Still mode: no animation loop at all. We draw one frame whenever something changes (colours, size).
    // Animated mode (opt-in): capped-fps loop that pauses while the tab is hidden.
    const loop = (now: number) => {
      raf = 0;
      if (!running) return;
      const L = live.current;
      if (L.paused) {
        if (dirty.current && !document.hidden && !lostCtx) { dirty.current = false; draw(now); }
        return; // no reschedule: zero cost while nothing changes
      }
      raf = requestAnimationFrame(loop);
      if (document.hidden || lostCtx) return;
      if (now - last < 1000 / Math.max(L.fps, 5)) return;
      last = now;
      draw(now);
    };
    kick.current = () => { if (!raf && running) raf = requestAnimationFrame(loop); };
    kick.current();
    const onVis = () => { if (!document.hidden) { dirty.current = true; kick.current(); } };
    document.addEventListener("visibilitychange", onVis);

    const onLost = (e: Event) => { e.preventDefault(); lostCtx = true; };
    const onRestored = () => { lostCtx = false; dirty.current = true; kick.current(); };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <div ref={hostRef} className={cn("relative flex w-full items-center justify-center overflow-hidden bg-black", className)} style={{ height, containerType: "size", ...style }} {...props}>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" style={{ width: "100%", height: "100%", display: "block" }} />
      {children}
    </div>
  );
};

export default Cloudscape;
