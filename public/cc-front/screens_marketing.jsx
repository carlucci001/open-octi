/* ============================================================
   FARRINGTON — marketing & onboarding screens
   ============================================================ */

/* ---------- top nav (logged out) ---------- */
function MarketingNav({ navigate, theme, setTheme }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "color-mix(in srgb, var(--cream) 82%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--line)" }}>
      <div className="wrap row between" style={{ height: 72 }}>
        <a onClick={() => navigate("landing")} style={{ cursor: "pointer" }}><Wordmark /></a>
        <div className="row gap-24" style={{ fontSize: 14.5, color: "var(--ink-2)", fontWeight: 550 }}>
          <a style={{ cursor: "pointer" }} className="navlink">How it works</a>
          <a style={{ cursor: "pointer" }} className="navlink">Use cases</a>
          <a style={{ cursor: "pointer" }} className="navlink">Pricing</a>
        </div>
        <div className="row gap-12">
          <ThemeSwitch theme={theme} setTheme={setTheme} />
          <button className="btn btn-quiet btn-sm" onClick={() => window.location.assign("/portal/login")}>Client sign in</button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("signup")}>Request a walkthrough</button>
        </div>
      </div>
    </div>
  );
}

function ThemeSwitch({ theme, setTheme }) {
  return (
    <div className="theme-switch" title="Switch visual direction">
      <button className={theme === "editorial" ? "on" : ""} onClick={() => setTheme("editorial")}>Editorial</button>
      <button className={theme === "modern" ? "on" : ""} onClick={() => setTheme("modern")}>Modern</button>
    </div>
  );
}

/* ---------- hero visual: request → delivered result ---------- */
function HeroVisual() {
  return (
    <div className="fade-up" style={{ position: "relative", marginTop: 8 }}>
      <div className="card" style={{ padding: 22, boxShadow: "var(--shadow-xl)" }}>
        <div className="row gap-10" style={{ marginBottom: 16 }}>
          <span className="spark" style={{ color: "var(--accent)" }}><Icon name="spark" size={20} /></span>
          <div style={{ fontSize: 15.5, color: "var(--ink)", fontWeight: 500 }}>
            “Find me 10 plumber leads in Western NC every morning”
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <span className="pill pill-done"><span className="dot" />Done · 7:00 AM</span>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>10 leads · 3 credits</span>
          </div>
          <div className="col gap-8">
            {[["Summit Drain & Rooter", "City, ST"], ["Pisgah Pipe & Fixture", "Brevard, NC"], ["Canton Pipeworks LLC", "Canton, NC"]].map(([b, t], i) => (
              <div key={i} className="row between" style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: "11px 14px" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{b}</span>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{t}</span>
              </div>
            ))}
            <div style={{ fontSize: 12.5, color: "var(--ink-3)", textAlign: "center", paddingTop: 4 }} className="mono">+ 7 more, sent to your inbox</div>
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", top: -16, right: -14, background: "var(--olive)", color: "#fff", borderRadius: 999, padding: "9px 15px", fontSize: 13, fontWeight: 700, boxShadow: "var(--shadow-lg)", display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="mail" size={15} /> Delivered
      </div>
    </div>
  );
}

/* ---------- landing page ---------- */
function Landing({ navigate, theme, setTheme }) {
  const F = window.FARR;
  const [vert, setVert] = useState("All");
  const [faqOpen, setFaqOpen] = useState(0);
  const verticals = ["All", ...Array.from(new Set(F.OUTCOMES.map((o) => o.vertical)))];
  const shown = F.OUTCOMES.filter((o) => vert === "All" || o.vertical === vert);

  return (
    <div className="fade-in">
      <MarketingNav navigate={navigate} theme={theme} setTheme={setTheme} />

      {/* hero */}
      <section className="wrap" style={{ padding: "76px 32px 64px", display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 64, alignItems: "center" }}>
        <div>
          <div className="eyebrow fade-up" style={{ marginBottom: 22 }}>Outcome-based automation</div>
          <h1 className="fade-up" style={{ fontSize: 60, lineHeight: 1.02, letterSpacing: "-.03em" }}>
            Tell us what you<br/>want done.<br/>
            <span style={{ color: "var(--accent)" }}>We automate it.</span>
          </h1>
          <p className="fade-up muted" style={{ fontSize: 19, lineHeight: 1.5, marginTop: 24, maxWidth: 480 }}>
            Farrington turns plain-English requests into running automations — leads, reports, outreach, content — delivered while you run your business.
          </p>
          <div className="fade-up row gap-12" style={{ marginTop: 32 }}>
            <button className="btn btn-primary btn-lg" onClick={() => navigate("signup")}>Request a walkthrough <Icon name="arrow" size={18} /></button>
            <button className="btn btn-ghost btn-lg" onClick={() => document.getElementById("how").scrollIntoView({ behavior: "smooth" })}>See how it works</button>
          </div>
          <div className="fade-up row gap-8" style={{ marginTop: 22, fontSize: 13.5, color: "var(--ink-3)" }}>
            <Icon name="check" size={16} style={{ color: "var(--olive)" }} /> No credit card · Free credits to start · No setup
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* how it works */}
      <section id="how" style={{ background: "var(--surface-2)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "72px 0" }}>
        <div className="wrap">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontSize: 36 }}>Three steps. Then it just runs.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 28 }}>
            {[
              { n: "01", icon: "spark", t: "Tell us the outcome", d: "Describe what you want in a sentence. No tools, no settings — just plain English." },
              { n: "02", icon: "bolt", t: "We build the automation", d: "We turn your request into a working automation behind the scenes. Nothing for you to configure." },
              { n: "03", icon: "mail", t: "Results show up on schedule", d: "Every morning, every Friday, or the moment it happens — delivered where you asked." },
            ].map((s) => (
              <div key={s.n} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="row between">
                  <span style={{ width: 46, height: 46, borderRadius: 13, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center" }}><Icon name={s.icon} size={23} /></span>
                  <span className="mono" style={{ fontSize: 28, color: "var(--line-2)", fontWeight: 400 }}>{s.n}</span>
                </div>
                <h3 style={{ fontSize: 20, marginTop: 6 }}>{s.t}</h3>
                <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* outcome gallery */}
      <section className="wrap" style={{ padding: "76px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>What people automate</div>
          <h2 style={{ fontSize: 36 }}>One sentence. A real outcome.</h2>
        </div>
        <div className="row center gap-8 wrap-w" style={{ marginBottom: 36 }}>
          {verticals.map((v) => (
            <button key={v} className={`chip ${vert === v ? "chip-selected" : ""}`} onClick={() => setVert(v)}>{v}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {shown.map((o, i) => (
            <div key={i} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative", borderColor: o.featured ? "var(--accent)" : "var(--line)", boxShadow: o.featured ? "var(--shadow-lg)" : "var(--card-shadow)" }}>
              {o.featured && <span style={{ position: "absolute", top: 18, right: 18, fontSize: 11, fontWeight: 700, color: "var(--accent-ink)", background: "var(--accent-soft)", padding: "4px 10px", borderRadius: 999 }} className="mono">FEATURED</span>}
              <div className="eyebrow" style={{ color: "var(--ink-3)" }}>{o.vertical} · {o.template}</div>
              <div style={{ fontSize: 18.5, fontWeight: 500, color: "var(--ink)", fontFamily: "var(--font-display)", lineHeight: 1.32, letterSpacing: "-.01em" }}>“{o.req}”</div>
              <div className="row gap-8" style={{ fontSize: 14, color: "var(--ink-2)", marginTop: "auto", paddingTop: 8 }}>
                <Icon name="arrow" size={16} style={{ color: "var(--accent)", flex: "none" }} /> {o.out}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* what you can ask for */}
      <section style={{ background: "var(--ink)", color: "var(--cream)", padding: "72px 0" }}>
        <div className="wrap">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 12 }}>If you can say it, we can run it</div>
            <h2 style={{ fontSize: 36, color: "var(--cream)" }}>A few of the things people ask for</h2>
          </div>
          <div className="row center gap-12 wrap-w" style={{ maxWidth: 900, margin: "0 auto" }}>
            {F.ASKS.map((a, i) => (
              <span key={i} style={{ fontSize: 15.5, padding: "12px 20px", borderRadius: 999, border: "1px solid rgba(250,247,240,.16)", color: "rgba(250,247,240,.82)", background: "rgba(250,247,240,.03)" }}>“{a}”</span>
            ))}
          </div>
        </div>
      </section>

      {/* testimonials */}
      <section className="wrap" style={{ padding: "72px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 22 }}>
          {F.TESTIMONIALS.map((t, i) => (
            <div key={i} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ fontSize: 18, lineHeight: 1.45, color: "var(--ink)", fontFamily: "var(--font-display)", letterSpacing: "-.01em" }}>“{t.quote}”</div>
              <div className="row gap-12" style={{ marginTop: "auto" }}>
                <span style={{ width: 38, height: 38, borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>{t.name[0]}</span>
                <div><div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{t.name}</div><div style={{ fontSize: 13, color: "var(--ink-3)" }}>{t.role}</div></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section style={{ background: "var(--surface-2)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "72px 0" }}>
        <div className="wrap" style={{ maxWidth: 920 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Simple credits. No token jargon.</div>
            <h2 style={{ fontSize: 36 }}>Pay for runs, not seats</h2>
            <p className="muted" style={{ fontSize: 16, marginTop: 12 }}>Each automation run uses a few credits. Pricing and any starting allowance are confirmed during setup.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
            {F.PACKS.map((p) => (
              <div key={p.id} className="card card-pad" style={{ textAlign: "center", borderColor: p.best ? "var(--accent)" : "var(--line)", position: "relative", boxShadow: p.best ? "var(--shadow-lg)" : "var(--card-shadow)" }}>
                {p.best && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "var(--accent)", color: "#fff", fontSize: 11.5, fontWeight: 700, padding: "4px 14px", borderRadius: 999 }}>MOST POPULAR</div>}
                <div className="mono" style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 6 }}>{p.credits} credits</div>
                <div style={{ fontSize: 44, fontFamily: "var(--font-display)", color: "var(--ink)", margin: "8px 0", letterSpacing: "-.02em" }}>${p.price}</div>
                <div className="muted" style={{ fontSize: 14, minHeight: 38 }}>{p.note}</div>
                <button className={`btn ${p.best ? "btn-primary" : "btn-ghost"} btn-block`} style={{ marginTop: 18 }} onClick={() => navigate("signup")}>Request a walkthrough</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="wrap" style={{ padding: "72px 32px", maxWidth: 760 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Questions</div>
          <h2 style={{ fontSize: 34 }}>Good to know</h2>
        </div>
        <div className="col gap-12">
          {F.FAQ.map((f, i) => (
            <div key={i} className="card" style={{ padding: "4px 24px", cursor: "pointer" }} onClick={() => setFaqOpen(faqOpen === i ? -1 : i)}>
              <div className="row between" style={{ padding: "20px 0" }}>
                <span style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--font-display)" }}>{f.q}</span>
                <Icon name="chevron" size={20} style={{ color: "var(--ink-3)", transform: faqOpen === i ? "rotate(180deg)" : "none", transition: "transform .25s var(--ease)" }} />
              </div>
              {faqOpen === i && <p className="muted fade-in" style={{ fontSize: 15.5, lineHeight: 1.55, paddingBottom: 22, maxWidth: 620 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* final cta */}
      <section className="wrap" style={{ padding: "20px 32px 90px" }}>
        <div style={{ background: "var(--accent)", borderRadius: "var(--r-xl)", padding: "64px 48px", textAlign: "center", color: "#fff", boxShadow: "var(--shadow-xl)" }}>
          <h2 style={{ fontSize: 40, color: "#fff", letterSpacing: "-.02em" }}>Hand us the busywork.</h2>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,.9)", marginTop: 14, maxWidth: 460, margin: "14px auto 0" }}>Describe one outcome and watch it run. Your first results are on us.</p>
          <button className="btn btn-lg" style={{ marginTop: 28, background: "#fff", color: "var(--accent-ink)" }} onClick={() => navigate("signup")}>Request a walkthrough <Icon name="arrow" size={18} /></button>
        </div>
      </section>

      {/* footer */}
      <footer style={{ borderTop: "1px solid var(--line)", padding: "40px 0" }}>
        <div className="wrap row between">
          <Wordmark size={18} />
          <div className="row gap-24" style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
            <span>How it works</span><span>Use cases</span><span>Pricing</span><span>Privacy</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--faint)" }} className="mono">© 2026 Farrington</div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- signup ---------- */
function Signup({ navigate }) {
  const go = () => window.location.assign("/portal/demo");
  return (
    <AuthShell navigate={navigate} side={
      <div>
        <div className="eyebrow" style={{ color: "var(--accent)", marginBottom: 18 }}>Talk with Farrington</div>
        <h2 style={{ fontSize: 34, lineHeight: 1.1 }}>See the workflows<br/>with a guided<br/>walkthrough.</h2>
        <p style={{ fontSize: 16, color: "rgba(250,247,240,.7)", marginTop: 20, lineHeight: 1.5 }}>Submitting a request creates a CRM lead for follow-up. It never creates a portal, account, lease, billing record, credits, or service.</p>
        <div className="col gap-14" style={{ marginTop: 36 }}>
          {["Review the actual client workflow", "Confirm scope and integrations", "Provision only after approval"].map((t) => (
            <div key={t} className="row gap-12" style={{ fontSize: 15, color: "rgba(250,247,240,.85)" }}>
              <span style={{ width: 24, height: 24, borderRadius: 999, background: "rgba(255,255,255,.14)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="check" size={14} /></span>{t}
            </div>
          ))}
        </div>
      </div>
    }>
      <h2 style={{ fontSize: 28 }}>Request a guided walkthrough</h2>
      <p className="muted" style={{ marginTop: 8, fontSize: 15 }}>No demo portal or account will be created.</p>
      <div className="col gap-18" style={{ marginTop: 30 }}>
        <div style={{ padding: 18, borderRadius: 12, background: "var(--surface-2)", color: "var(--ink-2)", lineHeight: 1.55 }}>You will choose a preferred time and tell us which services you want to see on the next screen.</div>
        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 6 }} onClick={go}>Schedule the walkthrough <Icon name="arrow" size={18} /></button>
        <div style={{ textAlign: "center", fontSize: 14, color: "var(--ink-3)" }}>Already a client? <a onClick={() => window.location.assign("/portal/login")} style={{ color: "var(--accent-ink)", fontWeight: 600, cursor: "pointer" }}>Sign in to your portal</a></div>
      </div>
    </AuthShell>
  );
}

function AuthShell({ navigate, side, children }) {
  return (
    <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>
      <div style={{ background: "var(--ink)", padding: "48px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <a onClick={() => navigate("landing")} style={{ cursor: "pointer", color: "var(--cream)" }}><Wordmark /></a>
        <div style={{ color: "var(--cream)" }}>{side}</div>
        <div className="mono" style={{ fontSize: 12, color: "rgba(250,247,240,.4)" }}>© 2026 Farrington</div>
      </div>
      <div style={{ display: "grid", placeItems: "center", padding: "48px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>{children}</div>
      </div>
    </div>
  );
}

/* ---------- onboarding (3 steps) ---------- */
function Onboarding({ navigate, store }) {
  const F = window.FARR;
  const user = store.state.user;
  const [step, setStep] = useState(0);
  const [vertical, setVertical] = useState(user.vertical);
  const [region, setRegion] = useState(user.region);
  const [delivery, setDelivery] = useState("Both");
  const verts = ["Construction & Trades", "Real Estate", "Healthcare", "Legal", "Automotive", "Restaurant"];

  const finish = (starter) => {
    store.set({ onboarded: true, delivery, user: { ...user, vertical, region } });
    if (starter) navigate("new", { seed: starter.text, template: starter.template });
    else navigate("app");
  };

  return (
    <div className="fade-in" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div className="wrap row between" style={{ height: 76 }}>
        <Wordmark />
        <div className="steps">
          {[0, 1, 2].map((i) => (
            <React.Fragment key={i}>
              <span className={`step-dot ${step === i ? "active" : step > i ? "done" : ""}`}>{step > i ? <Icon name="check" size={14} /> : i + 1}</span>
              {i < 2 && <span className={`step-line ${step > i ? "done" : ""}`} />}
            </React.Fragment>
          ))}
        </div>
        <a onClick={() => navigate("app")} style={{ fontSize: 14, color: "var(--ink-3)", cursor: "pointer" }}>I'll do this later</a>
      </div>

      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: "20px 32px 60px" }}>
        <div style={{ width: "100%", maxWidth: 620 }} key={step} className="fade-up">
          {step === 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Step 1 of 3</div>
              <h2 style={{ fontSize: 32 }}>What does your business do?</h2>
              <p className="muted" style={{ marginTop: 10, fontSize: 16 }}>This helps us suggest automations worth your time.</p>
              <div style={{ marginTop: 28 }}>
                <label className="flabel">Industry</label>
                <div className="row gap-10 wrap-w">{verts.map((v) => <button key={v} className={`chip ${vertical === v ? "chip-selected" : ""}`} onClick={() => setVertical(v)}>{v}</button>)}</div>
              </div>
              <div style={{ marginTop: 24 }}>
                <label className="flabel">Service area</label>
                <input className="field" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Western North Carolina" />
              </div>
              <button className="btn btn-primary btn-lg" style={{ marginTop: 32 }} onClick={() => setStep(1)}>Continue <Icon name="arrow" size={18} /></button>
            </div>
          )}
          {step === 1 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Step 2 of 3</div>
              <h2 style={{ fontSize: 32 }}>Where should results go?</h2>
              <p className="muted" style={{ marginTop: 10, fontSize: 16 }}>We'll deliver every automation here by default. Change it anytime.</p>
              <div style={{ marginTop: 28 }} className="col gap-12">
                {[["Email", `Sent to ${user.email}`, "mail"], ["Dashboard", "Waiting for you when you log in", "grid"], ["Both", "Email and dashboard — never miss one", "check"]].map(([k, d, ic]) => (
                  <button key={k} onClick={() => setDelivery(k)} className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, textAlign: "left", border: delivery === k ? "1.5px solid var(--accent)" : "1.5px solid var(--line)", background: delivery === k ? "var(--accent-wash)" : "var(--surface)" }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, background: delivery === k ? "var(--accent)" : "var(--cream-2)", color: delivery === k ? "#fff" : "var(--ink-3)", display: "grid", placeItems: "center", flex: "none" }}><Icon name={ic} size={20} /></span>
                    <div className="grow"><div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{k}</div><div style={{ fontSize: 14, color: "var(--ink-3)" }}>{d}</div></div>
                    {delivery === k && <Icon name="check" size={20} style={{ color: "var(--accent)" }} />}
                  </button>
                ))}
              </div>
              <div className="row gap-12" style={{ marginTop: 32 }}>
                <button className="btn btn-ghost btn-lg" onClick={() => setStep(0)}><Icon name="arrowL" size={18} /> Back</button>
                <button className="btn btn-primary btn-lg" onClick={() => setStep(2)}>Continue <Icon name="arrow" size={18} /></button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Step 3 of 3</div>
              <h2 style={{ fontSize: 32 }}>Pick something to automate.</h2>
              <p className="muted" style={{ marginTop: 10, fontSize: 16 }}>Choose a starter and we'll set it up with you. You can change everything.</p>
              <div className="col gap-12" style={{ marginTop: 28 }}>
                {F.STARTERS.map((s, i) => (
                  <button key={s.id} onClick={() => finish(s)} className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, textAlign: "left", border: i === 0 ? "1.5px solid var(--accent)" : "1.5px solid var(--line)", boxShadow: i === 0 ? "var(--shadow-md)" : "none", transition: "transform .18s var(--ease)" }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = ""}>
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "grid", placeItems: "center", flex: "none" }}><Icon name={s.icon} size={22} /></span>
                    <div className="grow">
                      <div className="row gap-10"><span style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>{s.template}</span>{i === 0 && <span className="mono" style={{ fontSize: 10.5, color: "var(--accent-ink)", background: "var(--accent-soft)", padding: "2px 8px", borderRadius: 999 }}>START HERE</span>}</div>
                      <div style={{ fontSize: 14, color: "var(--ink-3)", marginTop: 3 }}>{s.blurb}</div>
                    </div>
                    <Icon name="arrow" size={20} style={{ color: "var(--ink-3)" }} />
                  </button>
                ))}
              </div>
              <button className="btn btn-quiet" style={{ marginTop: 22 }} onClick={() => navigate("app")}>Skip — take me to my dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Landing, Signup, Onboarding, MarketingNav, ThemeSwitch });
