/* ============================================================
   FARRINGTON — shared components + icon set
   ============================================================ */
const { useState, useEffect, useRef } = React;

/* ---------- icons (simple line glyphs) ---------- */
function Icon({ name, size = 20, stroke = 1.7, style }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round", style };
  const G = {
    home:   <><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></>,
    bolt:   <><path d="M13 3L5 13h6l-1 8 8-12h-6z"/></>,
    grid:   <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    inbox:  <><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14v14H5z"/></>,
    card:   <><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/></>,
    gear:   <><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></>,
    spark:  <><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/></>,
    arrow:  <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    arrowL: <><path d="M19 12H5M11 6l-6 6 6 6"/></>,
    check:  <><path d="M4 12l5 5L20 6"/></>,
    copy:   <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></>,
    download: <><path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/></>,
    mail:   <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
    play:   <><path d="M7 5l11 7-11 7z"/></>,
    pause:  <><path d="M8 5v14M16 5v14"/></>,
    edit:   <><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></>,
    star:   <><path d="M12 3l2.6 6 6.4.5-4.9 4.2 1.5 6.3L12 16.8 6.9 20l1.5-6.3L3.5 9.5 9.9 9z"/></>,
    eye:    <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
    report: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    leads:  <><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M17 9l2 2 3-3.5"/></>,
    clock:  <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    plus:   <><path d="M12 5v14M5 12h14"/></>,
    chevron:<><path d="M6 9l6 6 6-6"/></>,
    thumbUp:<><path d="M7 11v9H4v-9z"/><path d="M7 11l4-7c1.3 0 2 .9 2 2v3h4.5c1.2 0 2 1 1.7 2.2l-1.4 6c-.2 1-1 1.6-2 1.6H7"/></>,
    thumbDn:<><path d="M17 13V4h3v9z"/><path d="M17 13l-4 7c-1.3 0-2-.9-2-2v-3H6.5c-1.2 0-2-1-1.7-2.2l1.4-6c.2-1 1-1.6 2-1.6H17"/></>,
    sun:    <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></>,
    pin:    <><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/></>,
  };
  return <svg {...p}>{G[name] || G.spark}</svg>;
}

/* ---------- wordmark ---------- */
function Wordmark({ size = 21, mono }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <img
        src="/brand/fd-brand-dark-transparent.png"
        alt="Farrington Development"
        style={{
          display: "block",
          width: mono ? size * 1.7 : size * 10,
          maxWidth: "min(260px, 58vw)",
          height: "auto",
        }}
      />
    </span>
  );
}

/* ---------- status pill ---------- */
function StatusPill({ status }) {
  const map = {
    active:   ["pill-done", "Active"],
    done:     ["pill-done", "Done"],
    running:  ["pill-running", "Running now"],
    building: ["pill-building", "Building"],
    paused:   ["pill-paused", "Paused"],
    error:    ["pill-error", "Needs attention"],
    watching: ["pill-running", "Watching"],
  };
  const [cls, label] = map[status] || map.active;
  return <span className={`pill ${cls}`}><span className="dot" />{label}</span>;
}

/* ---------- request bar ---------- */
function RequestBar({ placeholders, onSubmit, value, setValue, size = "lg", autoFocusHint = true }) {
  const [focused, setFocused] = useState(false);
  const [phIdx, setPhIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const internal = value === undefined;
  const [own, setOwn] = useState("");
  const val = internal ? own : value;
  const set = internal ? setOwn : setValue;

  // typewriter rotation for placeholder
  useEffect(() => {
    if (val) return;
    const full = placeholders[phIdx];
    let i = 0, dir = 1, hold = 0, raf;
    const tick = () => {
      if (dir === 1) {
        i++; setTyped(full.slice(0, i));
        if (i >= full.length) { hold++; if (hold > 38) { dir = -1; hold = 0; } }
      } else {
        i -= 2; setTyped(full.slice(0, Math.max(0, i)));
        if (i <= 0) { setPhIdx((p) => (p + 1) % placeholders.length); return; }
      }
      raf = setTimeout(tick, dir === 1 ? 42 : 18);
    };
    raf = setTimeout(tick, 400);
    return () => clearTimeout(raf);
  }, [phIdx, val, placeholders]);

  const submit = () => { if (val.trim()) onSubmit(val.trim()); };

  return (
    <div>
      <div className={`reqbar ${focused ? "focused" : ""}`}>
        <span className="spark"><Icon name="spark" size={24} /></span>
        <input
          value={val}
          placeholder={val ? "" : (typed || placeholders[phIdx])}
          onChange={(e) => set(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn btn-primary btn-lg" onClick={submit} style={{ borderRadius: "var(--r-xl)" }}>
          Tell us what you need <Icon name="arrow" size={18} />
        </button>
      </div>
      {autoFocusHint && (
        <div className="reqbar-hint">
          <Icon name="spark" size={14} style={{ color: "var(--accent)" }} />
          Describe an outcome in plain English — we build and run it for you.
        </div>
      )}
    </div>
  );
}

/* ---------- automation card ---------- */
function AutomationCard({ a, onOpen }) {
  const paused = a.status === "paused";
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 16, opacity: paused ? 0.82 : 1, cursor: "pointer", transition: "transform .2s var(--ease), box-shadow .2s var(--ease)" }}
      onClick={() => onOpen(a)}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "var(--shadow-lg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <div className="row gap-12" style={{ alignItems: "center" }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", flex: "none" }}>
            <Icon name={a.template === "Lead Sweep" ? "leads" : a.template === "Review Radar" ? "star" : "report"} size={20} />
          </span>
          <div className="eyebrow" style={{ color: "var(--ink-3)" }}>{a.template}</div>
        </div>
        <StatusPill status={a.status === "active" && a.template === "Review Radar" ? "watching" : a.status} />
      </div>
      <div style={{ fontSize: 18, lineHeight: 1.32, color: "var(--ink)", fontWeight: 500, fontFamily: "var(--font-display)", letterSpacing: "-.01em" }}>
        “{a.request}”
      </div>
      <div className="row gap-20" style={{ fontSize: 13.5, color: "var(--ink-3)", flexWrap: "wrap" }}>
        <span className="row gap-6"><Icon name="clock" size={15} /> {a.cadence}</span>
        <span className="row gap-6" style={{ color: paused ? "var(--ink-3)" : "var(--accent-ink)" }}>
          <Icon name="arrow" size={15} /> {a.nextRun}
        </span>
      </div>
      {a.snippet && (
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-md)", padding: "11px 14px" }}>
          {a.snippet}
        </div>
      )}
    </div>
  );
}

/* ---------- result card (feed) ---------- */
function ResultCard({ r, onOpen }) {
  return (
    <div className="card card-pad" style={{ display: "flex", gap: 16, alignItems: "center", cursor: "pointer", transition: "box-shadow .2s var(--ease), transform .2s var(--ease)" }}
      onClick={() => onOpen(r)}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.transform = ""; }}>
      <span style={{ width: 42, height: 42, borderRadius: 12, background: "var(--olive-soft)", color: "#3e5234", display: "grid", placeItems: "center", flex: "none" }}>
        <Icon name="check" size={21} />
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15.5, color: "var(--ink)", fontWeight: 600 }}>{r.title}</div>
        <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 2 }}>{r.sub}</div>
      </div>
      <div className="row gap-12" style={{ flex: "none" }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-3)" }} className="mono">{r.when}</span>
        <Icon name="arrow" size={18} style={{ color: "var(--ink-3)" }} />
      </div>
    </div>
  );
}

/* ---------- chip group ---------- */
function ChipGroup({ options, value, onChange, multi }) {
  const sel = multi ? (value || []) : value;
  const isSel = (o) => multi ? sel.includes(o) : sel === o;
  const toggle = (o) => {
    if (multi) onChange(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o]);
    else onChange(o);
  };
  return (
    <div className="row gap-10 wrap-w">
      {options.map((o) => (
        <button key={o} className={`chip ${isSel(o) ? "chip-selected" : ""}`} onClick={() => toggle(o)}>
          {isSel(o) && <Icon name="check" size={15} />} {o}
        </button>
      ))}
    </div>
  );
}

/* ---------- credit meter ---------- */
function CreditMeter({ balance, max = 100, compact }) {
  const low = balance <= 15;
  const pct = Math.max(4, Math.min(100, (balance / max) * 100));
  if (compact) {
    return (
      <div className="row gap-8" style={{ fontSize: 13, color: low ? "var(--amber)" : "var(--ink-2)", fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: low ? "var(--amber)" : "var(--olive)" }} />
        {balance} credits
      </div>
    );
  }
  return (
    <div className="col gap-8">
      <div className="row between"><span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)", whiteSpace: "nowrap" }}>Credits left</span><span style={{ fontSize: 13, fontWeight: 700, color: low ? "var(--amber)" : "var(--ink)" }}>{balance}</span></div>
      <div className={`meter ${low ? "low" : ""}`}><span style={{ width: pct + "%" }} /></div>
    </div>
  );
}

/* ---------- toast ---------- */
function Toast({ msg, icon = "check" }) {
  if (!msg) return null;
  return <div className="toast"><Icon name={icon} size={17} style={{ color: "var(--accent)" }} />{msg}</div>;
}

/* ---------- section heading ---------- */
function SectionTitle({ eyebrow, title, sub, action }) {
  return (
    <div className="row between" style={{ alignItems: "flex-end", marginBottom: 20, gap: 20 }}>
      <div className="grow" style={{ minWidth: 0 }}>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 9 }}>{eyebrow}</div>}
        <h2 style={{ fontSize: 25 }}>{title}</h2>
        {sub && <div className="muted" style={{ marginTop: 7, fontSize: 15 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

Object.assign(window, {
  Icon, Wordmark, StatusPill, RequestBar, AutomationCard, ResultCard,
  ChipGroup, CreditMeter, Toast, SectionTitle,
});
