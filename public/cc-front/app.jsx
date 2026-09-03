/* ============================================================
   FARRINGTON — app root: store, router, screen launcher
   ============================================================ */

function buildInitialState() {
  const F = window.FARR;
  const seedRuns = [
    { id: "run-rr-2", automationId: "auto-mktg", template: "Review Radar",
      request: "Email me any new Google review for Blue Ridge Plumbing the moment it posts",
      title: "New 5-star review just landed", sub: "Review Radar · Google Business", when: "2h ago",
      ranAt: "Today, 11:04 AM", status: "done", credits: 1,
      summary: "★★★★★ “Fast, friendly, and fixed it the same day. Highly recommend.” — a verified Google review for Blue Ridge Plumbing. We've drafted a warm thank-you reply you can send in one tap." },
    { id: "run-wr-1", automationId: "auto-recap", template: "Week in Review",
      request: "Every Friday, summarize my new leads and jobs into a one-page recap",
      title: "Your week, in one page", sub: "Week in Review · last Friday", when: "Fri",
      ranAt: "Fri, 4:00 PM", status: "done", credits: 2,
      summary: "This week: 14 new leads, 6 jobs booked, and about $4,200 in pipeline. Your busiest day was Wednesday. Two leads from City, ST are still waiting on a callback." },
  ];
  return {
    user: F.USER,
    credits: 42,
    automations: F.SEED_AUTOMATIONS.map((a) => ({ ...a })),
    runs: seedRuns,
    onboarded: false,
    delivery: "Both",
  };
}

function App() {
  const reviewMode = new URLSearchParams(location.search).get("review") === "1";
  const [theme, setTheme] = useState(() => localStorage.getItem("farr-theme") || "editorial");
  const [route, setRoute] = useState(() => reviewMode ? (location.hash.replace("#", "") || "landing") : "landing");
  const [params, setParams] = useState({});
  const [state, setState] = useState(buildInitialState);
  const [toastMsg, setToastMsg] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(false);

  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); localStorage.setItem("farr-theme", theme); }, [theme]);
  useEffect(() => {
    const onHash = () => { const r = location.hash.replace("#", ""); if (r && r !== route) setRoute(r); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [route]);

  const store = {
    state,
    set: (patch) => setState((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) })),
    toast: (m) => { setToastMsg(m); setTimeout(() => setToastMsg(""), 2800); },
  };

  const navigate = (r, p = {}) => {
    if (!reviewMode && !["landing", "signup"].includes(r)) {
      window.location.assign(r === "app" ? "/portal/login" : "/portal/demo");
      return;
    }
    setParams(p);
    setRoute(r);
    if (history.replaceState) history.replaceState(null, "", "#" + r);
    window.scrollTo({ top: 0 });
    setLauncherOpen(false);
  };

  // screens that render WITHOUT the app sidebar
  const bare = ["landing", "signup", "onboarding", "new"];
  const inApp = !bare.includes(route);

  let content;
  switch (route) {
    case "landing": content = <Landing navigate={navigate} theme={theme} setTheme={setTheme} />; break;
    case "signup": content = <Signup navigate={navigate} store={store} />; break;
    case "onboarding": content = <Onboarding navigate={navigate} store={store} />; break;
    case "new": content = <Wizard navigate={navigate} store={store} params={params} />; break;
    case "app": content = <Dashboard navigate={navigate} store={store} />; break;
    case "automations": content = <Automations navigate={navigate} store={store} />; break;
    case "automations-detail": content = <AutomationDetail navigate={navigate} store={store} params={params} />; break;
    case "results": content = <Results navigate={navigate} store={store} />; break;
    case "run": content = <RunResult navigate={navigate} store={store} params={params} />; break;
    case "billing": content = <Billing navigate={navigate} store={store} />; break;
    case "settings": content = <Settings store={store} />; break;
    default: content = <Landing navigate={navigate} theme={theme} setTheme={setTheme} />;
  }

  return (
    <>
      {inApp ? (
        <AppShell navigate={navigate} route={route} store={store} theme={theme} setTheme={setTheme}>{content}</AppShell>
      ) : content}
      {toastMsg && <Toast msg={toastMsg} />}
      {reviewMode && <div role="note" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 400, padding: "7px 12px", textAlign: "center", background: "#fff4e5", color: "#6b3d00", borderBottom: "1px solid #f0b35a", fontSize: 12, fontWeight: 700 }}>Fictional review prototype — no client account, portal, credits, billing, or services exist.</div>}
      {reviewMode && <ScreenLauncher open={launcherOpen} setOpen={setLauncherOpen} navigate={navigate} store={store} setState={setState} theme={theme} setTheme={setTheme} route={route} />}
    </>
  );
}

/* ---------- screen launcher (review aid: open any screen) ---------- */
function ScreenLauncher({ open, setOpen, navigate, store, setState, theme, setTheme, route }) {
  const groups = [
    { name: "Marketing", items: [["Landing page", () => navigate("landing")], ["Sign up", () => navigate("signup")], ["Onboarding", () => navigate("onboarding")]] },
    { name: "The app", items: [
      ["Dashboard", () => navigate("app")],
      ["Dashboard — empty state", () => { setState((s) => ({ ...s, automations: [], runs: [] })); navigate("app"); }],
      ["Automation wizard", () => navigate("new", { seed: "Find me 10 plumber leads in Western North Carolina every morning", template: "Lead Sweep" })],
      ["Result screen (with run)", () => { const r = store.state.runs.find((x) => x.leads) || store.state.runs[0]; if (r) navigate("run", { id: r.id, fresh: true }); else navigate("app"); }],
      ["Automations list", () => navigate("automations")],
      ["Automation detail", () => navigate("automations-detail", { id: store.state.automations[0]?.id })],
      ["Results feed", () => navigate("results")],
      ["Billing", () => navigate("billing")],
      ["Billing — low credits", () => { setState((s) => ({ ...s, credits: 8 })); navigate("billing"); }],
      ["Settings", () => navigate("settings")],
    ] },
    { name: "Reset", items: [["Reset demo data", () => { setState(buildInitialState()); navigate("landing"); }]] },
  ];
  return (
    <>
      <button onClick={() => setOpen(!open)} title="Jump to any screen"
        style={{ position: "fixed", bottom: 22, right: 22, zIndex: 300, background: "var(--ink)", color: "var(--cream)", border: "none", borderRadius: 999, padding: "12px 18px", fontSize: 13.5, fontWeight: 600, boxShadow: "var(--shadow-lg)", display: "flex", alignItems: "center", gap: 9, fontFamily: "var(--font-body)" }}>
        <Icon name="grid" size={16} /> Screens
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
          <div className="fade-up" style={{ position: "fixed", bottom: 70, right: 22, zIndex: 301, width: 300, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-xl)", padding: 12, maxHeight: "76vh", overflowY: "auto" }}>
            <div className="row between" style={{ padding: "6px 10px 12px" }}>
              <span className="eyebrow">Prototype map</span>
              <div className="theme-switch"><button className={theme === "editorial" ? "on" : ""} onClick={() => setTheme("editorial")}>Edit.</button><button className={theme === "modern" ? "on" : ""} onClick={() => setTheme("modern")}>Mod.</button></div>
            </div>
            {groups.map((g) => (
              <div key={g.name} style={{ marginBottom: 8 }}>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".1em", padding: "8px 10px 4px" }}>{g.name}</div>
                {g.items.map(([label, fn]) => (
                  <button key={label} onClick={fn} style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "9px 10px", borderRadius: 8, fontSize: 14, color: "var(--ink-2)", fontWeight: 500, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    {label} <Icon name="arrow" size={14} style={{ color: "var(--faint)" }} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
