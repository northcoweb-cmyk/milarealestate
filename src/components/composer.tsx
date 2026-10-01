"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, Paperclip, X, FileText, Image as ImageIcon, Loader2, Square } from "lucide-react";
import clsx from "clsx";

export interface Attachment { id: string; name: string; kind: string }
interface Props {
  onSend: (text: string, attachments: Attachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  large?: boolean;
  onError: (m: string) => void;
}

type SR = { start: () => void; stop: () => void; abort: () => void; lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null };

export function Composer({ onSend, disabled, placeholder = "What do you need to get done?", autoFocus, large, onError }: Props) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [micOk, setMicOk] = useState(true);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rec = useRef<SR | null>(null);
  const base = useRef("");

  useEffect(() => { setMicOk(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)); }, []);
  useEffect(() => { if (autoFocus) ta.current?.focus(); }, [autoFocus]);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 180) + "px"; }, [text]);

  const send = useCallback(() => {
    const t = text.trim();
    if ((!t && !files.length) || disabled || uploading) return;
    rec.current?.stop();
    onSend(t, files);
    setText(""); setFiles([]);
  }, [text, files, disabled, uploading, onSend]);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of Array.from(list)) fd.append("file", f);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Upload failed.");
      setFiles((x) => [...x, ...j.documents.map((d: any) => ({ id: d.id, name: d.name, kind: d.kind }))]);
    } catch (e) { onError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function toggleMic() {
    if (listening) { rec.current?.stop(); return; }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) { onError("Voice input isn't supported in this browser. Try Safari or Chrome."); return; }
    const r: SR = new Ctor();
    r.lang = navigator.language || "en-US"; r.interimResults = true; r.continuous = true;
    base.current = text ? text.trimEnd() + " " : "";
    r.onresult = (e: any) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(base.current + s);
    };
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") onError("Mila needs microphone permission to listen. You can allow it in your browser settings.");
      else if (e.error !== "aborted" && e.error !== "no-speech") onError("Voice input stopped unexpectedly. You can keep typing.");
    };
    r.onend = () => setListening(false);
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  }
  useEffect(() => () => rec.current?.abort(), []);

  return (
    <div className="w-full">
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {files.map((f) => (
            <span key={f.id} className="chip !min-h-[34px]">{f.kind === "image" ? <ImageIcon size={14} /> : <FileText size={14} />}<span className="max-w-[160px] truncate">{f.name}</span>
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}><X size={14} /></button></span>
          ))}
        </div>
      )}
      <div className={clsx("glass-strong flex items-end gap-1.5 transition-shadow focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_20%,transparent),var(--shadow)]", large ? "p-2.5" : "p-2")} style={{ borderRadius: large ? 34 : 30 }}>
        <input ref={fileRef} type="file" multiple hidden accept="image/*,application/pdf,.csv,.tsv,.xlsx,.xls,.txt,.md" onChange={(e) => upload(e.target.files)} />
        <button type="button" className="btn btn-quiet !min-h-[46px] !w-[46px] !p-0" onClick={() => fileRef.current?.click()} aria-label="Attach a file or photo" disabled={uploading}>{uploading ? <Loader2 className="animate-spin" size={21} /> : <Paperclip size={21} />}</button>
        <textarea ref={ta} rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder={listening ? "Listening…" : placeholder} aria-label="Tell Mila what you need"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          className="max-h-[180px] min-h-[46px] flex-1 resize-none bg-transparent px-1.5 py-[11px] text-[17px] leading-snug outline-none placeholder:text-ink-faint" />
        {micOk && <button type="button" className={clsx("btn !min-h-[46px] !w-[46px] !p-0", listening ? "btn-primary" : "btn-quiet")} onClick={toggleMic} aria-label={listening ? "Stop listening" : "Speak to Mila"} aria-pressed={listening}>{listening ? <Square size={16} fill="currentColor" /> : <Mic size={21} />}</button>}
        <button type="button" className="btn btn-primary !min-h-[46px] !w-[46px] !p-0" onClick={send} disabled={disabled || uploading || (!text.trim() && !files.length)} aria-label="Send"><ArrowUp size={22} strokeWidth={2.6} /></button>
      </div>
    </div>
  );
}
