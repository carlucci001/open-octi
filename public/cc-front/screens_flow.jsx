/* ============================================================
   FARRINGTON — wizard + result screen (the magic moments)
   ============================================================ */

/* ---------- wizard ---------- */
function Wizard({ navigate, store, params }) {
  const F = window.FARR;
  const seed = params.seed || "Find me 10 plumber leads in Western North Carolina every morning";
  const isLeadSweep = (params.template === "Lead Sweep") || /lead|plumber|find me/i.test(seed);

  const [step, setStep] = useState(1);
  const [ask, setAsk] = useState(seed);
  const [loc, setLoc] = useState("Western NC");
  const [count, setCount] = useState("10");
  const [cadence, setCadence] = useState("Every morning");
  const [delivery, setDelivery] = useState(store.state.delivery || "Both");

  const estCredits = isLeadSweep ? 3 : 2;
  const cadenceTime = cadence === "Every morning" ? "each morning at 7:00 AM" : cadence === "Weekdays" ? "every weekday at 7:00 AM" : cadence === "Weekly" ? "every Monday at 7:00 AM" : "once, right now";

  const summary = isLeadSweep
    ? `${cadence === "Just once" ? "Once" : "Each scheduled run"}, we'll find ${count} new plumber leads in ${loc} and deliver them to your ${delivery.toLowerCase()}.`
    : `We'll run this ${cadence.toLowerCase()} and deliver the results to your ${delivery.toLowerCase()}.`;

  const launch = (runNow) => {
    const auto = F.makeLeadSweep();
    auto.request = ask;
    auto.cadence = cadence === "Just once" ? "Just once" : cadence === "Every morning" ? "Every morning · 7:00 AM" : cadence === "Weekdays" ? "Weekdays · 7:00 AM" : "Weekly · Mon 7:00 AM";
    auto.nextRun = cadence === "Just once" ? "—" : "Tomorrow, 7:00 AM";
    auto.creditsPerRun = estCredits;
    auto.delivery = delivery;

    if (runNow) {
      const run = {
        id: "run-ls-" + Date.now(),
        automationId: auto.id,
        template: "Lead Sweep",
        request: ask,
        title: "10 plumber leads are ready",
        sub: `Lead Sweep · ${loc}`,
        when: "Just now",
        ranAt: "Today, " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        status: "done",
        credits: estCredits,
        leads: F.LEADS.slice(0, parseInt(count) || 10),
        delivery,
      };
      auto.runs = [{ id: run.id, ranAt: run.ranAt, status: "done", credits: estCredits, kind: "leads" }];
      auto.lastRun = "Just now";
      store.set({
        automations: [auto, ...store.state.automations.filter((a) => a.id !== auto.id)],
        runs: [run, ...store.state.runs],
        credits: store.state.credits - estCredits,
      });
      navigate("run", { id: run.id, fresh: true });
    } else {
      auto.runs = [];
      auto.lastRun = "Not yet";
      store.set({ automations: [auto, ...store.state.automations.filter((a) => a.id !== auto.id)] });
      store.toast("Got it — building your automation. First run tomorrow, 7:00 AM.");
      navigate("app");
    }
  };

  const steps = ["The ask", "A couple questions", "Preview", "Launch"];

  return (
    <div className="fade-in" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--cream)" }}>
      {/* header */}
      <div className="row between" style={{ padding: "22px 40px", borderBottom: "1px solid var(--line)" }}>
        <button className="btn btn-quiet btn-sm" onClick={() => navigate("app")} style={{ marginLeft: -8 }}><Icon name="arrowL" size={16} /> Cancel</button>
        <Wordmark size={18} />
        <div style={{ width: 80 }} />
      </div>

      {/* step rail */}
      <div className="row center" style={{ padding: "26px 0 8px" }}>
        <div className="steps">
          {steps.map((s, i) => {
            const n = i + 1;
            return (
              <React.Fragment key={s}>
                <div className="row gap-8" style={{ alignItems: "center" }}>
                  <span className={`step-dot ${step === n ? "active" : step > n ? "done" : ""}`}>{step > n ? <Icon name="check" size={13} /> : n}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: step === n ? "var(--ink)" : "var(--ink-3)", display: window.innerWidth < 760 ? "none" : "inline" }}>{s}</span>
                </div>
                {n < 4 && <span className={`step-line ${step > n ? "done" : ""}`} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "20px 32px 60px" }}>
        <div style={{ width: "100%", maxWidth: 640 }} key={step} className="fade-up">

          {/* STEP 1 — the ask */}
          {step === 1 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Tell us the outcome</div>
              <h2 style={{ fontSize: 30 }}>What do you want done?</h2>
              <p className="muted" style={{ marginTop: 10, fontSize: 16 }}>Say it however feels natural. We'll handle the how.</p>
              <textarea className="field" style={{ marginTop: 24, minHeight: 120, fontSize: 18, lineHeight: 1.5, resize: "none", fontFamily: "var(--font-display)" }} value={ask} onChange={(e) => setAsk(e.target.value)} autoFocus />
              <div className="row between" style={{ marginTop: 28 }}>
                <span className="reqbar-hint" style={{ margin: 0 }}><Icon name="spark" size={14} style={{ color: "var(--accent)" }} /> We'll ask a quick question or two next.</span>
                <button className="btn btn-primary btn-lg" onClick={() => setStep(isLeadSweep ? 2 : 3)}>Continue <Icon name="arrow" size={18} /></button>
              </div>
            </div>
          )}

          {/* STEP 2 — clarify */}
          {step === 2 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Just to get it right</div>
              <h2 style={{ fontSize: 30 }}>A couple quick questions.</h2>
              <p className="muted" style={{ marginTop: 10, fontSize: 16 }}>Tap an answer — no forms.</p>
              <div className="col gap-26" style={{ marginTop: 28 }}>
                <ClarifyRow q="Which area should we cover?">
                  <ChipGroup options={["Western NC", "Asheville only", "All of NC", "Add another area"]} value={loc} onChange={setLoc} />
                </ClarifyRow>
                <ClarifyRow q="How many leads per run?">
                  <ChipGroup options={["10", "25", "50"]} value={count} onChange={setCount} />
                </ClarifyRow>
                <ClarifyRow q="How often?">
                  <ChipGroup options={["Every morning", "Weekdays", "Weekly", "Just once"]} value={cadence} onChange={setCadence} />
                </ClarifyRow>
                <ClarifyRow q="Where should we send it?">
                  <ChipGroup options={["Email", "Dashboard", "Both"]} value={delivery} onChange={setDelivery} />
                </ClarifyRow>
              </div>
              <div className="row gap-12" style={{ marginTop: 34 }}>
                <button className="btn btn-ghost btn-lg" onClick={() => setStep(1)}><Icon name="arrowL" size={18} /> Back</button>
                <button className="btn btn-primary btn-lg" onClick={() => setStep(3)}>Looks good <Icon name="arrow" size={18} /></button>
              </div>
            </div>
          )}

          {/* STEP 3 — preview */}
          {step === 3 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Here's what we'll do</div>
              <h2 style={{ fontSize: 30 }}>Ready when you are.</h2>
              <div className="card card-pad" style={{ marginTop: 24, borderColor: "var(--accent)", boxShadow: "var(--shadow-md)" }}>
                <div style={{ fontSize: 19, lineHeight: 1.5, color: "var(--ink)", fontFamily: "var(--font-display)", letterSpacing: "-.01em" }}>{summary}</div>
                <div className="row gap-24 wrap-w" style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                  <Meta icon="clock" label="Schedule" value={cadence === "Just once" ? "Just once" : `Delivered ${cadenceTime}`} />
                  <Meta icon="mail" label="Delivery" value={delivery} />
                  <Meta icon="card" label="Cost" value={`~${estCredits} credits per run`} />
                </div>
              </div>
              {isLeadSweep && (
                <div style={{ marginTop: 20 }}>
                  <div className="flabel" style={{ marginBottom: 10 }}>A sample of what you'll get</div>
                  <div className="card" style={{ overflow: "hidden" }}>
                    <div className="row between" style={{ padding: "13px 18px", background: "var(--surface-2)", borderBottom: "1px solid var(--line)" }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{F.LEADS[0].biz}</span>
                      <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{F.LEADS[0].town}</span>
                    </div>
                    <div className="row gap-24" style={{ padding: "13px 18px", fontSize: 13.5, color: "var(--ink-2)" }}>
                      <span>{F.LEADS[0].contact}</span><span className="mono">{F.LEADS[0].phone}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="row gap-12" style={{ marginTop: 30 }}>
                <button className="btn btn-ghost btn-lg" onClick={() => setStep(isLeadSweep ? 2 : 1)}><Icon name="arrowL" size={18} /> Back</button>
                <button className="btn btn-primary btn-lg" onClick={() => setStep(4)}>Continue <Icon name="arrow" size={18} /></button>
              </div>
            </div>
          )}

          {/* STEP 4 — launch */}
          {step === 4 && (
            <div style={{ textAlign: "center" }}>
              <span style={{ width: 64, height: 64, borderRadius: 18, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", margin: "0 auto 22px" }}><Icon name="spark" size={32} /></span>
              <h2 style={{ fontSize: 30 }}>You're all set.</h2>
              <p className="muted" style={{ marginTop: 10, fontSize: 16, maxWidth: 440, margin: "10px auto 0" }}>{summary}</p>
              <div className="col gap-12" style={{ marginTop: 32, maxWidth: 360, marginInline: "auto" }}>
                <button className="btn btn-primary btn-lg btn-block" onClick={() => launch(true)}><Icon name="play" size={18} /> Run once now to see results</button>
                <button className="btn btn-ghost btn-lg btn-block" onClick={() => launch(false)}>Start automation</button>
              </div>
              <div className="row center gap-8" style={{ marginTop: 20, fontSize: 13, color: "var(--ink-3)" }}>
                <Icon name="card" size={14} /> Running once now uses ~{estCredits} credits · {store.state.credits} available
              </div>
              <button className="btn btn-quiet btn-sm" style={{ marginTop: 14 }} onClick={() => setStep(3)}><Icon name="arrowL" size={15} /> Back to preview</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClarifyRow({ q, children }) {
  return (
    <div>
      <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", marginBottom: 12 }}>{q}</div>
      {children}
    </div>
  );
}
function Meta({ icon, label, value }) {
  return (
    <div>
      <div className="row gap-7" style={{ color: "var(--ink-3)", marginBottom: 5 }}><Icon name={icon} size={15} /><span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</span></div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{value}</div>
    </div>
  );
}

/* ---------- result screen ---------- */
function RunResult({ navigate, store, params }) {
  const run = store.state.runs.find((r) => r.id === params.id) || store.state.runs[0];
  const fresh = params.fresh;
  const [phase, setPhase] = useState(fresh ? "running" : "done");
  const [showDetails, setShowDetails] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (phase === "running") {
      const t = setTimeout(() => setPhase("done"), 2200);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (!run) return <div className="appmain"><p className="muted">No result found.</p><button className="btn btn-ghost" onClick={() => navigate("app")}>Back to dashboard</button></div>;

  const fire = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); };

  // running animation
  if (phase === "running") {
    const steps = ["Searching local sources…", "Checking for duplicates…", "Formatting your list…", "Almost ready…"];
    return (
      <div className="appmain fade-in" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 440 }}>
          <div style={{ position: "relative", width: 84, height: 84, margin: "0 auto 28px" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid var(--accent-soft)" }} />
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid transparent", borderTopColor: "var(--accent)", animation: "spin 0.9s linear infinite" }} />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--accent)" }}><Icon name="spark" size={32} /></span>
          </div>
          <div className="pill pill-running" style={{ marginBottom: 18 }}><span className="dot" />Running now…</div>
          <h2 style={{ fontSize: 26 }}>Finding your plumber leads.</h2>
          <RunningSteps steps={steps} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const hasLeads = run.leads && run.leads.length;

  return (
    <div className="appmain fade-in">
      <button className="btn btn-quiet btn-sm" style={{ marginBottom: 18, marginLeft: -8 }} onClick={() => navigate("app")}><Icon name="arrowL" size={16} /> Dashboard</button>

      {/* headline + meta */}
      <div className="row gap-12" style={{ marginBottom: 8 }}>
        <span className="pill pill-done"><span className="dot" />Done</span>
        {run.delivery && <span className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>· Emailed to you</span>}
      </div>
      <h1 style={{ fontSize: 30, maxWidth: 760, lineHeight: 1.15 }}>“{run.request}”</h1>
      <div className="row gap-20 wrap-w" style={{ marginTop: 14, fontSize: 13.5, color: "var(--ink-3)" }}>
        <span className="row gap-6"><Icon name="clock" size={15} /> {run.ranAt}</span>
        <span className="row gap-6"><Icon name="check" size={15} style={{ color: "var(--olive)" }} /> Done</span>
        <span className="row gap-6"><Icon name="card" size={15} /> {run.credits} credits used</span>
        <span className="row gap-6"><Icon name="arrow" size={15} style={{ color: "var(--accent)" }} /> Next run: tomorrow, 7:00 AM</span>
      </div>

      {/* deliverable */}
      {hasLeads ? (
        <div className="card" style={{ marginTop: 28, overflow: "hidden" }}>
          <div className="row between" style={{ padding: "18px 24px", borderBottom: "1px solid var(--line)", flexWrap: "wrap", gap: 12 }}>
            <div className="row gap-12">
              <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}><Icon name="leads" size={20} /></span>
              <div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{run.leads.length} plumber leads</div><div style={{ fontSize: 13, color: "var(--ink-3)" }}>{run.sub.replace("Lead Sweep · ", "")} · fresh today</div></div>
            </div>
            <div className="row gap-8">
              <button className="btn btn-ghost btn-sm" onClick={() => fire("Copied 10 leads to your clipboard.")}><Icon name="copy" size={16} /> Copy</button>
              <button className="btn btn-ghost btn-sm" onClick={() => fire("Downloading leads.csv…")}><Icon name="download" size={16} /> Download CSV</button>
              <button className="btn btn-soft btn-sm" onClick={() => fire("Sent to your inbox.")}><Icon name="mail" size={16} /> Email to me</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>Business</th><th>Contact</th><th>Phone</th><th>Email</th><th>Location</th><th>Source</th></tr></thead>
              <tbody>
                {run.leads.map((l, i) => (
                  <tr key={i}>
                    <td className="strong">{l.biz}</td><td>{l.contact}</td><td className="mono" style={{ fontSize: 13 }}>{l.phone}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{l.email}</td><td>{l.town}</td>
                    <td><span style={{ fontSize: 12, color: "var(--ink-3)", background: "var(--cream-2)", padding: "3px 9px", borderRadius: 999 }}>{l.source}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row between" style={{ padding: "12px 24px", background: "var(--surface-2)", borderTop: "1px solid var(--line)" }}>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>SAMPLE DATA · demo</span>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Deduped against your existing leads</span>
          </div>
        </div>
      ) : (
        <div className="card card-pad" style={{ marginTop: 28 }}>
          <p style={{ fontSize: 16, color: "var(--ink)", lineHeight: 1.6 }}>{run.summary || "Your result is ready and was delivered as requested."}</p>
        </div>
      )}

      {/* actions */}
      <div className="row gap-12 wrap-w" style={{ marginTop: 26 }}>
        <button className="btn btn-primary" onClick={() => { setPhase("running"); }}><Icon name="play" size={17} /> Run again</button>
        <button className="btn btn-ghost" onClick={() => navigate("new", { seed: run.request, template: run.template, edit: true })}><Icon name="edit" size={17} /> Edit request</button>
        <button className="btn btn-ghost" onClick={() => { store.set({ automations: store.state.automations.map((a) => a.id === run.automationId ? { ...a, status: "paused", nextRun: "Paused" } : a) }); fire("Paused. We won't run this until you resume."); }}><Icon name="pause" size={17} /> Pause</button>
      </div>

      {/* feedback */}
      <div className="card card-pad" style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <span style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)" }}>Was this useful?</span>
        {feedback ? (
          <span className="row gap-8" style={{ color: "var(--olive)", fontSize: 14.5, fontWeight: 600 }}><Icon name="check" size={17} /> Thanks — we'll keep tuning.</span>
        ) : (
          <div className="row gap-10">
            <button className="btn btn-ghost btn-sm" onClick={() => setFeedback("up")}><Icon name="thumbUp" size={16} /> Yes</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFeedback("down")}><Icon name="thumbDn" size={16} /> Not quite</button>
          </div>
        )}
      </div>

      {/* details expander — the ONLY place internals appear */}
      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        <button onClick={() => setShowDetails(!showDetails)} style={{ width: "100%", background: "transparent", border: "none", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="row gap-10" style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink-2)" }}><Icon name="report" size={17} /> Details</span>
          <Icon name="chevron" size={18} style={{ color: "var(--ink-3)", transform: showDetails ? "rotate(180deg)" : "none", transition: "transform .25s var(--ease)" }} />
        </button>
        {showDetails && (
          <div className="fade-in" style={{ padding: "0 24px 22px", borderTop: "1px solid var(--line)" }}>
            <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.9, paddingTop: 16 }}>
              <div>07:00:01  run started · automation {run.automationId}</div>
              <div>07:00:03  sources queried · 4 directories</div>
              <div>07:00:12  142 candidates found</div>
              <div>07:00:14  deduped against 38 existing leads</div>
              <div>07:00:15  formatted {run.leads ? run.leads.length : 10} results</div>
              <div>07:00:16  delivered · email + dashboard</div>
              <div style={{ color: "var(--olive)" }}>07:00:16  status: done · {run.credits} credits</div>
            </div>
          </div>
        )}
      </div>

      <Toast msg={toast} />
    </div>
  );
}

function RunningSteps({ steps }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, steps.length - 1)), 520);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="col gap-10" style={{ marginTop: 24, textAlign: "left", maxWidth: 280, marginInline: "auto" }}>
      {steps.map((s, idx) => (
        <div key={idx} className="row gap-10" style={{ fontSize: 14.5, color: idx <= i ? "var(--ink)" : "var(--faint)", transition: "color .3s", opacity: idx <= i ? 1 : 0.5 }}>
          <span style={{ width: 18, height: 18, borderRadius: 999, display: "grid", placeItems: "center", background: idx < i ? "var(--olive)" : idx === i ? "var(--accent)" : "var(--cream-2)", color: "#fff", flex: "none" }}>
            {idx < i ? <Icon name="check" size={12} /> : idx === i ? <span style={{ width: 6, height: 6, borderRadius: 999, background: "#fff", animation: "pulse 1s infinite" }} /> : ""}
          </span>
          {s}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Wizard, RunResult });
