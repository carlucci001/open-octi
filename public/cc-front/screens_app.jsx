/* ============================================================
   FARRINGTON — logged-in app shell + screens
   ============================================================ */

/* ---------- app shell (sidebar) ---------- */
function AppShell({ navigate, route, store, theme, setTheme, children }) {
  const nav = [
    { id: "app", label: "Home", icon: "home" },
    { id: "automations", label: "Automations", icon: "bolt" },
    { id: "results", label: "Results", icon: "inbox" },
    { id: "billing", label: "Billing", icon: "card" },
    { id: "settings", label: "Settings", icon: "gear" },
  ];
  const credits = store.state.credits;
  const low = credits <= 15;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a onClick={() => navigate("landing")} style={{ cursor: "pointer", padding: "2px 8px 18px" }}><Wordmark size={19} /></a>
        <div className="col gap-4" style={{ flex: 1 }}>
          {nav.map((n) => (
            <a key={n.id} className={`nav-item ${route === n.id || (route === "automations-detail" && n.id === "automations") || (route === "run" && n.id === "results") ? "active" : ""}`} onClick={() => navigate(n.id)}>
              <span className="ic"><Icon name={n.icon} size={19} /></span>{n.label}
            </a>
          ))}
        </div>
        <div className="col gap-14" style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
          {low && (
            <div style={{ background: "var(--amber-soft)", border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)", borderRadius: "var(--r-md)", padding: "12px 14px", fontSize: 13, color: "#8a6418" }}>
              <strong>Running low.</strong> Top up to keep automations running.
            </div>
          )}
          <CreditMeter balance={credits} max={100} />
          <button className="btn btn-soft btn-sm btn-block" onClick={() => navigate("billing")}>Top up credits</button>
          <div className="row gap-10" style={{ padding: "8px 6px 0", alignItems: "center" }}>
            <span style={{ width: 34, height: 34, borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, flex: "none" }}>{store.state.user.firstName[0]}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{store.state.user.business}</div><div style={{ fontSize: 12, color: "var(--ink-3)" }}>{store.state.user.firstName}</div></div>
          </div>
          <div style={{ paddingTop: 4 }}><ThemeSwitch theme={theme} setTheme={setTheme} /></div>
        </div>
      </aside>
      <main style={{ background: "var(--cream)" }}>{children}</main>
    </div>
  );
}

/* ---------- dashboard ---------- */
function Dashboard({ navigate, store }) {
  const F = window.FARR;
  const { user, automations, runs, credits } = store.state;
  const [reqVal, setReqVal] = useState("");
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const hasAutos = automations.length > 0;

  return (
    <div className="appmain fade-in">
      {/* greeting + request bar (hero) */}
      <div style={{ marginBottom: 36 }}>
        <div className="row between" style={{ marginBottom: 26, gap: 20 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
            <h1 style={{ fontSize: 34 }}>{greet}, {user.firstName}.</h1>
          </div>
          <CreditMeter balance={credits} compact />
        </div>
        <RequestBar placeholders={F.PLACEHOLDERS} value={reqVal} setValue={setReqVal} onSubmit={(t) => navigate("new", { seed: t })} />
      </div>

      {!hasAutos ? (
        <EmptyDashboard navigate={navigate} store={store} />
      ) : (
        <>
          {/* your automations */}
          <section style={{ marginBottom: 44 }}>
            <SectionTitle eyebrow="Your automations" title="Running for you" action={<button className="btn btn-ghost btn-sm" onClick={() => navigate("automations")}>View all <Icon name="arrow" size={16} /></button>} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="stagger">
              {automations.map((a) => <AutomationCard key={a.id} a={a} onOpen={(x) => navigate("automations-detail", { id: x.id })} />)}
            </div>
          </section>

          {/* recent results */}
          <section>
            <SectionTitle eyebrow="Recent results" title="Fresh off the line" action={runs.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => navigate("results")}>All results <Icon name="arrow" size={16} /></button>} />
            {runs.length === 0 ? (
              <div className="card card-pad" style={{ textAlign: "center", padding: "40px" }}>
                <span style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", margin: "0 auto 16px" }}><Icon name="clock" size={26} /></span>
                <h3 style={{ fontSize: 19 }}>We're on it.</h3>
                <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>First results expected by <strong>7:00 AM tomorrow</strong>. We'll email you the moment they're ready.</p>
              </div>
            ) : (
              <div className="col gap-12 stagger">
                {runs.map((r) => <ResultCard key={r.id} r={r} onOpen={(x) => navigate("run", { id: x.runId })} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ---------- empty dashboard ---------- */
function EmptyDashboard({ navigate, store }) {
  const F = window.FARR;
  return (
    <div className="fade-up">
      <SectionTitle eyebrow="Get started" title="Try one of these" sub="Pick a starter and we'll set it up with you in under a minute." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {F.STARTERS.map((s, i) => (
          <button key={s.id} onClick={() => navigate("new", { seed: s.text, template: s.template })} className="card card-pad" style={{ display: "flex", gap: 16, alignItems: "flex-start", textAlign: "left", border: i === 0 ? "1.5px solid var(--accent)" : "1px solid var(--line)", transition: "transform .18s var(--ease), box-shadow .18s var(--ease)" }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "var(--shadow-lg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
            <span style={{ width: 46, height: 46, borderRadius: 13, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", flex: "none" }}><Icon name={s.icon} size={23} /></span>
            <div>
              <div className="row gap-10"><span style={{ fontSize: 16.5, fontWeight: 600, color: "var(--ink)" }}>{s.template}</span>{i === 0 && <span className="mono" style={{ fontSize: 10.5, color: "var(--accent-ink)", background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 999 }}>POPULAR</span>}</div>
              <div style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 6, fontFamily: "var(--font-display)" }}>“{s.text}”</div>
              <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 8 }}>{s.blurb}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- automations list ---------- */
function Automations({ navigate, store }) {
  const { automations } = store.state;
  const [filter, setFilter] = useState("All");
  const filtered = automations.filter((a) => filter === "All" || (filter === "Active" ? a.status === "active" : a.status === "paused"));
  return (
    <div className="appmain fade-in">
      <SectionTitle eyebrow="Automations" title="Everything you've set running" action={<button className="btn btn-primary btn-sm" onClick={() => navigate("new")}><Icon name="plus" size={16} /> New automation</button>} />
      <div className="row gap-8" style={{ marginBottom: 24 }}>
        {["All", "Active", "Paused"].map((f) => <button key={f} className={`chip ${filter === f ? "chip-selected" : ""}`} onClick={() => setFilter(f)} style={{ fontSize: 13.5, padding: "7px 15px" }}>{f}</button>)}
      </div>
      {filtered.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 48 }}><p className="muted">Nothing here yet.</p></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="stagger">
          {filtered.map((a) => <AutomationCard key={a.id} a={a} onOpen={(x) => navigate("automations-detail", { id: x.id })} />)}
        </div>
      )}
    </div>
  );
}

/* ---------- automation detail ---------- */
function AutomationDetail({ navigate, store, params }) {
  const a = store.state.automations.find((x) => x.id === params.id) || store.state.automations[0];
  const [toast, setToast] = useState("");
  if (!a) return <div className="appmain"><p>Not found.</p></div>;
  const paused = a.status === "paused";
  const toggle = () => {
    store.set({ automations: store.state.automations.map((x) => x.id === a.id ? { ...x, status: paused ? "active" : "paused", nextRun: paused ? "Tomorrow, 7:00 AM" : "Paused" } : x) });
    setToast(paused ? "Resumed. Next run tomorrow, 7:00 AM." : "Paused. We won't run this until you resume.");
    setTimeout(() => setToast(""), 2600);
  };
  return (
    <div className="appmain fade-in">
      <button className="btn btn-quiet btn-sm" style={{ marginBottom: 20, marginLeft: -8 }} onClick={() => navigate("automations")}><Icon name="arrowL" size={16} /> Automations</button>
      <div className="row between" style={{ alignItems: "flex-start", marginBottom: 8 }}>
        <div className="eyebrow">{a.template}</div>
        <StatusPill status={a.status === "active" && a.template === "Review Radar" ? "watching" : a.status} />
      </div>
      <h1 style={{ fontSize: 30, maxWidth: 720, lineHeight: 1.15 }}>“{a.request}”</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, margin: "28px 0" }}>
        {[["Schedule", a.cadence, "clock"], ["Next run", a.nextRun, "arrow"], ["Cost", `~${a.creditsPerRun} credits / run`, "card"]].map(([l, v, ic]) => (
          <div key={l} className="card card-pad" style={{ padding: 20 }}>
            <div className="row gap-8" style={{ color: "var(--ink-3)", marginBottom: 8 }}><Icon name={ic} size={16} /><span style={{ fontSize: 12.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>{l}</span></div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="row gap-12" style={{ marginBottom: 40 }}>
        <button className="btn btn-primary" onClick={() => navigate("new", { seed: a.request, template: a.template, edit: true })}><Icon name="edit" size={17} /> Edit request</button>
        <button className="btn btn-ghost" onClick={toggle}><Icon name={paused ? "play" : "pause"} size={17} /> {paused ? "Resume" : "Pause"}</button>
        {a.runs.length > 0 && <button className="btn btn-ghost" onClick={() => navigate("run", { id: a.runs[0].id })}>View latest result <Icon name="arrow" size={16} /></button>}
      </div>

      <SectionTitle title="Run history" sub="Every time this automation has run." />
      {a.runs.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 40 }}>
          <p className="muted">Hasn't run yet. <strong>First results expected tomorrow, 7:00 AM.</strong></p>
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          {a.runs.map((r, i) => (
            <div key={r.id} className="row between" style={{ padding: "16px 22px", borderBottom: i < a.runs.length - 1 ? "1px solid var(--line)" : "none", cursor: "pointer" }}
              onClick={() => navigate("run", { id: r.id })}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
              onMouseLeave={(e) => e.currentTarget.style.background = ""}>
              <div className="row gap-14"><StatusPill status={r.status} /><span style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 550 }} className="mono">{r.ranAt}</span></div>
              <div className="row gap-16"><span className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{r.credits} credits</span><Icon name="arrow" size={17} style={{ color: "var(--ink-3)" }} /></div>
            </div>
          ))}
        </div>
      )}
      <Toast msg={toast} icon={paused ? "play" : "pause"} />
    </div>
  );
}

/* ---------- results feed ---------- */
function Results({ navigate, store }) {
  const { runs } = store.state;
  return (
    <div className="appmain fade-in">
      <SectionTitle eyebrow="Results" title="Everything we've delivered" />
      {runs.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: 56 }}>
          <span style={{ width: 56, height: 56, borderRadius: 15, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", margin: "0 auto 18px" }}><Icon name="inbox" size={28} /></span>
          <h3 style={{ fontSize: 20 }}>No results yet</h3>
          <p className="muted" style={{ marginTop: 8 }}>Your first delivery is expected by <strong>7:00 AM tomorrow</strong>.</p>
        </div>
      ) : (
        <div className="col gap-12 stagger">
          {runs.map((r) => <ResultCard key={r.id} r={r} onOpen={(x) => navigate("run", { id: x.runId })} />)}
        </div>
      )}
    </div>
  );
}

/* ---------- billing ---------- */
function Billing({ navigate, store }) {
  const F = window.FARR;
  const { credits } = store.state;
  const low = credits <= 15;
  const used = Math.max(0, 100 - credits);
  const [toast, setToast] = useState("");
  const topUp = (pack) => {
    store.set({ credits: credits + pack.credits });
    setToast(`Added ${pack.credits} credits. You're all set.`);
    setTimeout(() => setToast(""), 2600);
  };
  return (
    <div className="appmain fade-in">
      <SectionTitle eyebrow="Billing" title="Credits & plan" />
      {low && (
        <div style={{ background: "var(--amber-soft)", border: "1px solid color-mix(in srgb, var(--amber) 30%, transparent)", borderRadius: "var(--r-lg)", padding: "18px 22px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
          <Icon name="bolt" size={22} style={{ color: "#8a6418", flex: "none" }} />
          <div className="grow"><div style={{ fontWeight: 700, color: "#8a6418" }}>You're running low on credits.</div><div style={{ fontSize: 14, color: "#8a6418" }}>Top up to keep your automations running on schedule.</div></div>
        </div>
      )}
      <div className="card card-pad" style={{ marginBottom: 32 }}>
        <div className="row between" style={{ alignItems: "flex-end", marginBottom: 18 }}>
          <div><div className="muted" style={{ fontSize: 14 }}>Credits remaining</div><div style={{ fontSize: 44, fontFamily: "var(--font-display)", color: low ? "var(--amber)" : "var(--ink)", letterSpacing: "-.02em" }}>{credits}</div></div>
          <div style={{ textAlign: "right" }}><div className="muted" style={{ fontSize: 14 }}>Used this month</div><div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>{used} credits</div></div>
        </div>
        <div className={`meter ${low ? "low" : ""}`}><span style={{ width: Math.max(4, Math.min(100, used)) + "%" }} /></div>
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>A typical run uses ~3 credits. We'll always tell you the cost before anything runs.</div>
      </div>

      <SectionTitle title="Top up" sub="One-time credit packs. No subscription required." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
        {F.PACKS.map((p) => (
          <div key={p.id} className="card card-pad" style={{ textAlign: "center", borderColor: p.best ? "var(--accent)" : "var(--line)", position: "relative", boxShadow: p.best ? "var(--shadow-lg)" : "var(--card-shadow)" }}>
            {p.best && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--accent)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 13px", borderRadius: 999 }}>BEST VALUE</div>}
            <div className="mono" style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 4 }}>{p.credits} credits</div>
            <div style={{ fontSize: 38, fontFamily: "var(--font-display)", color: "var(--ink)", margin: "6px 0", letterSpacing: "-.02em" }}>${p.price}</div>
            <div className="muted" style={{ fontSize: 13.5, minHeight: 34 }}>{p.note}</div>
            <button className={`btn ${p.best ? "btn-primary" : "btn-ghost"} btn-block`} style={{ marginTop: 14 }} onClick={() => topUp(p)}>Top up</button>
          </div>
        ))}
      </div>
      <Toast msg={toast} icon="check" />
    </div>
  );
}

/* ---------- settings ---------- */
function Settings({ store }) {
  const { user, delivery } = store.state;
  return (
    <div className="appmain fade-in">
      <SectionTitle eyebrow="Settings" title="Account & delivery" />
      <div className="col gap-20" style={{ maxWidth: 640 }}>
        <div className="card card-pad">
          <h3 style={{ fontSize: 18, marginBottom: 18 }}>Business</h3>
          <div className="col gap-16">
            <div><label className="flabel">Business name</label><input className="field" defaultValue={user.business} /></div>
            <div><label className="flabel">Email</label><input className="field" defaultValue={user.email} /></div>
            <div><label className="flabel">Service area</label><input className="field" defaultValue={user.region} /></div>
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Delivery default</h3>
          <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>Where new automations send results unless you change them.</p>
          <ChipGroup options={["Email", "Dashboard", "Both"]} value={delivery || "Both"} onChange={(v) => store.set({ delivery: v })} />
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }}>Save changes</button>
      </div>
    </div>
  );
}

Object.assign(window, { AppShell, Dashboard, EmptyDashboard, Automations, AutomationDetail, Results, Billing, Settings });
