// Proxy for the owner.example.com desk-notes widget. Secret stays server-side.
const EP = process.env.SITE_NOTE_ENDPOINT || "https://owner.example.com";
const SECRET = (process.env.SITE_NOTE_SECRET || "").trim();

export async function GET() {
  try {
    const r = await fetch(EP + "/api/notes", { cache: "no-store" });
    const d = await r.json();
    return Response.json(d);
  } catch (e) {
    return Response.json({ notes: [], err: String(e?.message || e).slice(0, 200) });
  }
}

export async function POST(req) {
  if (!SECRET) return Response.json({ ok: false, error: "SITE_NOTE_SECRET not set" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (!text || text.length > 500) return Response.json({ ok: false, error: "text required, max 500" }, { status: 400 });
  const r = await fetch(EP + "/api/note", {
    method: "POST",
    headers: { "content-type": "application/json", "x-note-secret": SECRET },
    body: JSON.stringify({ text, source: "command-center-dashboard" }),
  });
  return Response.json(await r.json().catch(() => ({ ok: r.ok })), { status: r.status });
}

export async function DELETE(req) {
  if (!SECRET) return Response.json({ ok: false, error: "SITE_NOTE_SECRET not set" }, { status: 500 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
  const r = await fetch(EP + "/api/note", {
    method: "DELETE",
    headers: { "content-type": "application/json", "x-note-secret": SECRET },
    body: JSON.stringify({ id }),
  });
  return Response.json(await r.json().catch(() => ({ ok: r.ok })), { status: r.status });
}
