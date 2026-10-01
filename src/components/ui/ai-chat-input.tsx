"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chat input with file attachments (21st.dev "ai-chat-input", reworked for Mila):
 * no model picker, no effort selector, no microphone — just the message box,
 * an upload button, image thumbnails with a shared-element preview, and file
 * chips for PDFs / spreadsheets / documents. Supports click, drag-and-drop and paste.
 */

const SPRING = "cubic-bezier(0.175, 0.885, 0.32, 1.275)";

interface Attachment {
  id: string;
  file: File;
  url: string | null; // object URL for images
  name: string;
  ext: string;
  isImage: boolean;
  width?: number;
  height?: number;
}

export interface PromptInputProps {
  /** Return `false` to keep the text/files (e.g. an upload failed). Anything else clears the input. */
  onSubmit?: (value: string, files: File[]) => void | boolean | Promise<void | boolean>;
  onError?: (message: string) => void;
  placeholder?: string;
  className?: string;
  /** Visual size: "lg" for the hero input, "md" for the chat dock. */
  size?: "md" | "lg";
  disabled?: boolean;
  autoFocus?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  maxAttachments?: number;
  maxFileBytes?: number;
  accept?: string;
}

const DEFAULT_ACCEPT = "image/*,application/pdf,.csv,.tsv,.xlsx,.xls,.txt,.md";

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : "FILE";
}

// ----------------------------------------------------------------------------
// Thumbnail / chip
// ----------------------------------------------------------------------------
function AttachmentThumb({ attachment, index, onRemove, onOpen }: {
  attachment: Attachment; index: number; onRemove: (id: string) => void; onOpen: (a: Attachment, rect: DOMRect) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className="group relative shrink-0 animate-in fade-in slide-in-from-top-3 zoom-in-90 duration-300" style={{ animationDelay: `${index * 35}ms`, animationFillMode: "backwards" }}>
      <button
        ref={ref} type="button"
        onClick={() => attachment.isImage && ref.current && onOpen(attachment, ref.current.getBoundingClientRect())}
        className={cn(
          "relative flex size-12 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted outline-none transition-transform duration-200 hover:scale-[1.04] active:scale-[0.96]",
          !attachment.isImage && "cursor-default hover:scale-100",
        )}
        aria-label={attachment.isImage ? `Preview ${attachment.name}` : attachment.name}
        title={attachment.name}
      >
        {attachment.isImage && attachment.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.url} alt={attachment.name} className="size-full object-cover" draggable={false} />
        ) : (
          <span className="flex flex-col items-center gap-0.5 text-foreground/70"><FileText size={17} /><span className="text-[9px] font-bold tracking-wide">{attachment.ext}</span></span>
        )}
      </button>
      <button
        type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}
        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card text-foreground/70 opacity-100 shadow-sm transition hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <X size={11} strokeWidth={2.6} />
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Shared-element image preview
// ----------------------------------------------------------------------------
function AttachmentGalleryModal({ attachment, originRect, onClose }: { attachment: Attachment; originRect: DOMRect; onClose: () => void }) {
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening");
  const [target, setTarget] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const maxW = Math.min(window.innerWidth * 0.86, 560), maxH = Math.min(window.innerHeight * 0.78, 720);
    const nw = attachment.width || 800, nh = attachment.height || 600;
    const k = Math.min(maxW / nw, maxH / nh, 1.6);
    const width = nw * k, height = nh * k;
    setTarget({ top: (window.innerHeight - height) / 2, left: (window.innerWidth - width) / 2, width, height });
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, [attachment]);

  const close = useCallback(() => setPhase("closing"), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const open = phase === "open";
  const g = open && target ? { ...target, radius: 20 } : { top: originRect.top, left: originRect.left, width: originRect.width, height: originRect.height, radius: 12 };
  const ease = phase === "closing" ? "ease-out" : SPRING, dur = phase === "closing" ? "0.3s" : "0.45s";

  return (
    <div className="fixed inset-0 z-[100]" onClick={close} role="dialog" aria-modal="true" aria-label={`Preview of ${attachment.name}`}>
      <div className="absolute inset-0 bg-black/45 backdrop-blur-md transition-opacity duration-300" style={{ opacity: open ? 1 : 0 }} />
      <div
        className="fixed overflow-hidden bg-muted"
        style={{ top: g.top, left: g.left, width: g.width, height: g.height, borderRadius: g.radius, boxShadow: open ? "0 24px 60px -12px rgb(0 0 0 / 0.45)" : "none", transition: `top ${dur} ${ease}, left ${dur} ${ease}, width ${dur} ${ease}, height ${dur} ${ease}, border-radius ${dur} ${ease}` }}
        onTransitionEnd={() => phase === "closing" && onClose()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.url ?? ""} alt={attachment.name} className="size-full object-cover" draggable={false} />
      </div>
      <button type="button" onClick={close} aria-label="Close preview" className={cn("fixed right-4 top-4 flex size-10 items-center justify-center rounded-full bg-card/90 text-foreground shadow-md backdrop-blur transition duration-300", open ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0")}>
        <X size={18} />
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(function PromptInput(
  { onSubmit, onError, placeholder = "Ask anything", className, size = "md", disabled, autoFocus, defaultValue = "", value: controlled, onChange, maxAttachments = 6, maxFileBytes = 12 * 1024 * 1024, accept = DEFAULT_ACCEPT },
  ref,
) {
  const [local, setLocal] = useState(defaultValue);
  const value = controlled ?? local;
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [active, setActive] = useState<{ a: Attachment; rect: DOMRect } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [areaH, setAreaH] = useState(28);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useRef<Set<string>>(new Set());

  const hasFiles = attachments.length > 0;
  const canSend = (value.trim() !== "" || hasFiles) && !disabled && !submitting;
  const lg = size === "lg";

  const setValue = useCallback((v: string) => { if (controlled === undefined) setLocal(v); onChange?.(v); }, [controlled, onChange]);

  // auto-grow
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    const h = Math.max(lg ? 30 : 26, Math.min(el.scrollHeight, 168));
    el.style.height = `${h}px`;
    setAreaH(h);
  }, [value, lg]);

  useEffect(() => { if (autoFocus) ta.current?.focus(); }, [autoFocus]);
  // release object URLs only when the component goes away
  useEffect(() => { const set = urls.current; return () => set.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const addFiles = useCallback((list: File[]) => {
    if (!list.length) return;
    const room = Math.max(0, maxAttachments - attachments.length);
    if (room === 0) { onError?.(`You can attach up to ${maxAttachments} files at a time.`); return; }
    const ok: File[] = [];
    for (const f of list) {
      if (f.size > maxFileBytes) { onError?.(`${f.name} is larger than ${Math.round(maxFileBytes / 1048576)} MB.`); continue; }
      ok.push(f);
    }
    if (ok.length > room) onError?.(`Only the first ${room} file${room === 1 ? "" : "s"} were added (limit ${maxAttachments}).`);
    for (const file of ok.slice(0, room)) {
      const isImage = file.type.startsWith("image/");
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;
      const base = { id, file, name: file.name, ext: extOf(file.name), isImage };
      if (!isImage) { setAttachments((p) => [...p, { ...base, url: null }]); continue; }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      const img = new Image();
      img.onload = () => setAttachments((p) => [...p, { ...base, url, width: img.naturalWidth, height: img.naturalHeight }]);
      img.onerror = () => setAttachments((p) => [...p, { ...base, url: null, isImage: false }]); // e.g. HEIC the browser can't draw
      img.src = url;
    }
  }, [attachments.length, maxAttachments, maxFileBytes, onError]);

  const remove = (id: string) => setAttachments((p) => {
    const t = p.find((a) => a.id === id);
    if (t?.url) { URL.revokeObjectURL(t.url); urls.current.delete(t.url); }
    return p.filter((a) => a.id !== id);
  });

  const submit = async () => {
    if (!canSend) return;
    setSubmitting(true);
    try {
      const r = await onSubmit?.(value.trim(), attachments.map((a) => a.file));
      if (r === false) return;
      setValue("");
      attachments.forEach((a) => { if (a.url) { URL.revokeObjectURL(a.url); urls.current.delete(a.url); } });
      setAttachments([]);
    } finally { setSubmitting(false); }
  };

  return (
    <>
      <div ref={ref} className={cn("relative flex w-full flex-col", className)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
      >
        <input ref={fileRef} type="file" multiple accept={accept} className="hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />

        {/* attachment tray: slides up from behind the input */}
        <div aria-hidden={!hasFiles} className="relative z-0 w-full overflow-hidden" style={{ height: hasFiles ? 68 : 0, transition: `height 0.4s ${SPRING}` }}>
          <div className="prompt-scrollbar absolute inset-x-5 bottom-[-8px] flex h-[68px] items-start gap-2.5 overflow-x-auto rounded-t-2xl border border-b-0 border-border bg-muted px-2.5 pb-1 pt-2.5 backdrop-blur-xl"
            style={{ transform: hasFiles ? "translateY(0)" : "translateY(100%)", opacity: hasFiles ? 1 : 0, transition: `transform 0.4s ${SPRING}, opacity 0.3s ease-out` }}>
            {attachments.map((a, i) => <AttachmentThumb key={a.id} attachment={a} index={i} onRemove={remove} onOpen={(at, rect) => setActive({ a: at, rect })} />)}
          </div>
        </div>

        {/* main card */}
        <div
          onMouseDown={(e) => { if ((e.target as HTMLElement).closest("button")) return; if (e.target !== ta.current) { e.preventDefault(); ta.current?.focus(); } }}
          className={cn(
            "relative z-10 flex w-full flex-col border border-border bg-card text-foreground backdrop-blur-2xl transition-[box-shadow,border-color] focus-within:border-ring/50 focus-within:ring-4 focus-within:ring-ring/15",
            lg ? "gap-1 rounded-[32px] px-3 pb-2.5 pt-3.5" : "gap-0.5 rounded-[28px] px-2.5 pb-2 pt-3",
            dragging && "border-ring ring-4 ring-ring/25",
          )}
          style={{ boxShadow: "var(--shadow)" }}
        >
          <textarea
            ref={ta} value={value} rows={1} aria-label="Message Mila" placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); addFiles(files); } }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }}
            style={{ height: areaH, transition: "height 0.15s ease-out" }}
            className={cn("prompt-scrollbar w-full resize-none bg-transparent px-2.5 leading-snug text-foreground outline-none placeholder:text-muted-foreground", lg ? "text-[18px]" : "text-[16.5px]", areaH >= 168 ? "overflow-y-auto" : "overflow-y-hidden")}
          />
          <div className="flex items-center justify-between">
            <button
              type="button" onClick={() => fileRef.current?.click()} disabled={attachments.length >= maxAttachments}
              aria-label="Attach photos or files" title="Attach photos, PDFs or spreadsheets"
              className="flex size-10 items-center justify-center rounded-full text-foreground/60 outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus size={22} />
            </button>
            <button
              type="button" onClick={() => void submit()} disabled={!canSend} aria-label="Send"
              className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md outline-none transition duration-200 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 disabled:opacity-40 disabled:shadow-none"
              style={canSend ? { background: "linear-gradient(135deg, var(--accent), var(--accent-2))" } : undefined}
            >
              {submitting || disabled ? <Loader2 size={19} className="animate-spin" /> : <ArrowUp size={21} strokeWidth={2.6} />}
            </button>
          </div>
        </div>
        {dragging && <p className="pointer-events-none absolute inset-x-0 -top-7 text-center text-[13px] font-semibold text-muted-foreground">Drop to attach</p>}
      </div>
      {active && <AttachmentGalleryModal attachment={active.a} originRect={active.rect} onClose={() => setActive(null)} />}
    </>
  );
});
PromptInput.displayName = "PromptInput";
