"use client";
// Site Notes widget — posts short public notes to owner.example.com (/now page).
// Same notes Maggie posts by voice via her post_site_note tool.
import { useCallback, useEffect, useState } from "react";
import { clientCapabilityStatus } from "@/lib/client-capabilities";

export default function SiteNoteCard() {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [capability, setCapability] = useState(null);

  const load = useCallback(() => {
    fetch("/api/site-note").then(r => r.json()).then(d => setNotes(Array.isArray(d.notes) ? d.notes : [])).catch(() => {});
  }, []);
  useEffect(() => {
    let cancelled = false;
    clientCapabilityStatus("site-note").then(status => {
      if (cancelled) return;
      setCapability(status);
      if (status.status === "configured") load();
    });
    return () => { cancelled = true; };
  }, [load]);

  async function post() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/site-note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
      const d = await r.json();
      if (d.ok) { setText(""); load(); } else setErr(d.error || "post failed");
    } catch (e) { setErr("post failed"); }
    setBusy(false);
  }

  async function del(id) {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/site-note", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (d.ok) load(); else setErr("delete failed");
    } catch (e) { setErr("delete failed"); }
    setBusy(false);
  }

  function stamp(at) {
    try {
      const d = new Date(at);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch (e) { return ""; }
  }

  if (capability?.status === "not_configured") {
    return (
      <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>Site Notes</h2>
        <div role="status" className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          Not configured — add <code>{capability.missing?.[0] || "SITE_NOTE_ENDPOINT"}</code> to your .env.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-5 flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>Site Notes</h2>
          <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>
            Public · owner.example.com/now · Maggie posts here too
          </div>
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") post(); }}
          maxLength={400}
          placeholder="What are you working on?"
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg, transparent)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button
          onClick={post}
          disabled={busy || !text.trim()}
          className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ background: "#38BDF8", color: "#06121F" }}
        >
          Post
        </button>
      </div>
      {err && <div className="text-xs mb-2" style={{ color: "#F87171" }}>{err}</div>}
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 200 }}>
        {notes.length === 0 && (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>No notes yet. Post one, or tell Maggie: &ldquo;make a note for my site&rdquo;.</div>
        )}
        {notes.map(n => (
          <div key={n.id} className="flex items-start gap-2 text-xs rounded-lg p-2" style={{ border: "1px solid var(--border)" }}>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{stamp(n.at)}</div>
              <div className="mt-0.5" style={{ color: "var(--text)" }}>{n.text}</div>
            </div>
            <button
              onClick={() => del(n.id)}
              title="Remove from the site"
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
