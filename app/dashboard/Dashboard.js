"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "../components/PageHeader";
import CallButton from "../components/CallButton";
import SiteNoteCard from "../components/SiteNoteCard";
import { playQueuedLoginWelcomeAudio } from "../login/loginWelcomeAudio";
import { reportClientError } from "../components/reportClientError";
import OpenOctiFirstRun from './OpenOctiFirstRun'
import { brandAssetsFor } from '@/lib/brand-assets'

// Dashboard charts use the cool dark-theme palette: blues, cyan, slate, and white.
const SLATE = "#8EA4B8";
const SLATE_DEEP = "#5F748C";
const ICE = "#F8FBFF";
const BLUE_PALE = "#BAE6FD";
const BLUE_LIGHT = "#7DD3FC";
const BLUE = "#38BDF8";
const BLUE_DEEP = "#2563EB";
const CYAN = "#67E8F9";
const TEAL = "#5EEAD4";
const BRAND_ASSETS = brandAssetsFor();

const STS_COLORS = {
  prospect: SLATE, called: BLUE_PALE, voicemail: SLATE_DEEP,
  interested: BLUE, email_sent: CYAN, follow_up: BLUE_DEEP,
  closed: ICE, declined: SLATE,
};

const DEV_STS_COLORS = {
  discovery: SLATE, qualified: BLUE_PALE, proposal: BLUE,
  new: SLATE, contacted: CYAN, converted: ICE,
  unqualified: SLATE_DEEP, declined: SLATE,
};

const CAMPAIGN_COLORS = {
  sponsors: BLUE,
  newspaper: BLUE_PALE,
  tda: BLUE_DEEP,
  farrington_dev: ICE,
};

function chartFillTextColor(color) {
  return color === BLUE_DEEP || color === SLATE_DEEP ? ICE : "#06121F";
}

function api(url) {
  return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
}

function buildDailyLeads(leads, days = 30, getDate = l => l.ca || l.createdAt) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = leads.filter(l => (getDate(l) || "").slice(0, 10) === key).length;
    out.push({ date: key, value: total, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  }
  return out;
}

function classifyCampaign(lead) {
  const campaign = lead?.campaign || lead?.suggestedPipelineId || lead?.legacy?.campaign || "";
  const listType = lead?.lt || lead?.legacy?.lt || "";
  if (campaign === "farrington_dev" || listType === "farrington_dev") return "farrington_dev";
  if (campaign === "newspaper" || listType === "newspaper") return "newspaper";
  if (campaign === "tda" || listType === "tda") return "tda";
  if (campaign === "sponsors" || listType === "sponsors") return "sponsors";
  return "other";
}

function isDevLead(lead) {
  return lead?.suggestedPipelineId === "farrington_dev"
    || lead?.source === "inbound"
    || lead?.legacy?.source === "dev-leads"
    || lead?.legacy?.campaign === "farrington_dev"
    || lead?.legacy?.lt === "farrington_dev";
}

function isSponsorPipelineLead(lead) {
  const campaign = classifyCampaign(lead);
  return campaign === "sponsors" || campaign === "newspaper" || campaign === "tda";
}

function CommandCenterIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9h3M8 13h6M16 9h1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 19l-2 2M18 19l2 2" />
    </svg>
  );
}

// ─── Activity Pulse — multi-series daily activity heat across 6 categories ──────────
const PULSE_CATEGORIES = [
  { id: "emails",  label: "Emails",       icon: "📧", color: CYAN },
  { id: "images",  label: "Images",       icon: "🎨", color: BLUE_PALE },
  { id: "calls",   label: "Calls",        icon: "📞", color: BLUE },
  { id: "tasks",   label: "Tasks done",   icon: "✅", color: BLUE_LIGHT },
  { id: "money",   label: "Money flow",   icon: "💰", color: ICE },
  { id: "agent",   label: "Ops/system",   icon: "🤖", color: TEAL },
];

function classifyActivity(type) {
  const t = String(type || "").toLowerCase();
  if (/^email/.test(t) || t === "dictate_email") return "emails";
  if (/^(call|video|phone|dial|voicemail)/.test(t)) return "calls";
  if (/^payment|^invoice/.test(t)) return "money";
  if (/^image_gen|^image_/.test(t)) return "images";
  if (/^task_complete/.test(t)) return "tasks";
  // Generic agent ops bucket (notes, status changes, document edits, log_activity)
  return "agent";
}

function buildDailyActivity({ activities, media, tasks, days = 14 }) {
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Build day buckets
  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayKeys.push(key);
    out.push({ date: key, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), weekday: d.toLocaleDateString("en-US", { weekday: "short" }), counts: { emails: 0, images: 0, calls: 0, tasks: 0, money: 0, agent: 0 } });
  }
  const byKey = Object.fromEntries(out.map((b, i) => [b.date, i]));
  // Activities
  for (const a of (activities || [])) {
    const dateStr = (a.at || a.createdAt || "").slice(0, 10);
    if (!(dateStr in byKey)) continue;
    out[byKey[dateStr]].counts[classifyActivity(a.type)]++;
  }
  // Media (images)
  for (const m of (media || [])) {
    const dateStr = (m.createdAt || "").slice(0, 10);
    if (!(dateStr in byKey)) continue;
    out[byKey[dateStr]].counts.images++;
  }
  // Tasks (completed only)
  for (const t of (tasks || [])) {
    if (t.status !== "done") continue;
    const dateStr = (t.completedAt || t.updatedAt || t.createdAt || "").slice(0, 10);
    if (!(dateStr in byKey)) continue;
    out[byKey[dateStr]].counts.tasks++;
  }
  return out;
}

function ActivityPulseTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg p-3 text-xs shadow-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
      <div className="font-semibold mb-2">{row.label}</div>
      <div className="space-y-1">
        {PULSE_CATEGORIES.map(cat => (
          <div key={cat.id} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
              {cat.label}
            </span>
            <span className="font-mono" style={{ color: cat.color }}>{row[cat.id] || 0}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 flex justify-between gap-5 font-semibold" style={{ borderTop: "1px solid var(--border)" }}>
        <span>Total</span>
        <span className="font-mono">{row.total}</span>
      </div>
    </div>
  );
}

function ActivityPulseChart({ days, height = 170 }) {
  const rows = Array.isArray(days) ? days : [];
  const chartData = rows.map(d => {
    const counts = (d && typeof d.counts === "object" && d.counts) || {};
    return {
      date: d?.date,
      label: d?.label,
      ...counts,
      total: Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0),
    };
  });

  // Explicit height + minWidth:0 stops ResponsiveContainer measuring -1 x -1 on
  // first mount, which silently rendered an empty chart.
  return (
    <div style={{ height, minHeight: height, width: "100%", minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={height} minHeight={height}>
        <RechartsBarChart data={chartData} barCategoryGap="18%" margin={{ top: 8, right: 2, bottom: 0, left: 2 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.28} strokeDasharray="2 4" />
          <XAxis dataKey="label" hide />
          <YAxis hide allowDecimals={false} />
          <Tooltip content={<ActivityPulseTooltip />} cursor={{ fill: "rgba(125, 211, 252, 0.08)" }} />
          {PULSE_CATEGORIES.map(cat => (
            <Bar key={cat.id} dataKey={cat.id} stackId="activity" fill={cat.color} radius={[2, 2, 0, 0]} />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Tiny sparkline for the chip header — shows just one category's trend
function MiniSpark({ values, color, height = 18 }) {
  const max = Math.max(...values, 1);
  const w = 60;
  const step = w / Math.max(values.length - 1, 1);
  const points = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ActivityPulseCard({ pulse, onNavigate }) {
  const [days, setDays] = useState(14);
  const picked = pulse?.[`d${days}`];
  const series = Array.isArray(picked) ? picked : (Array.isArray(pulse?.d14) ? pulse.d14 : []);
  // A day row arriving without `counts` threw here, and with no error boundary
  // in the tree that took the whole Command Center down.
  const countsOf = d => (d && typeof d.counts === "object" && d.counts) || {};
  const sumCounts = d => Object.values(countsOf(d)).reduce((a, b) => a + (Number(b) || 0), 0);
  // Per-category totals + sparkline values
  const totals = { emails: 0, images: 0, calls: 0, tasks: 0, money: 0, agent: 0 };
  for (const d of series) for (const c of PULSE_CATEGORIES) totals[c.id] += Number(countsOf(d)[c.id]) || 0;
  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const half = Math.floor(series.length / 2);
  const recentHalf = series.slice(half).reduce((a, d) => a + sumCounts(d), 0);
  const olderHalf = series.slice(0, half).reduce((a, d) => a + sumCounts(d), 0);
  const trendPct = olderHalf === 0 ? (recentHalf > 0 ? 100 : 0) : Math.round(((recentHalf - olderHalf) / olderHalf) * 100);
  const busiestDay = series.reduce((best, d) => {
    const tot = sumCounts(d);
    return tot > best.tot ? { tot, label: d?.label || "—", weekday: d?.weekday || "—" } : best;
  }, { tot: 0, label: "—", weekday: "—" });

  const navTarget = {
    emails: "leads", images: "media", calls: "phone", tasks: "tasks", money: "finance", agent: "agents",
  };

  return (
    <div className="lg:col-span-2 rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <span>🫀</span> Activity Pulse
          </h2>
          <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>
            Logged CRM, agent, voice, finance, and system events - not hours worked
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-bold font-mono" style={{ color: "var(--accent)" }}>{grandTotal}</div>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>total events · last {days} days</div>
          </div>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {[7, 14, 30].map(n => (
              <button key={n} onClick={() => setDays(n)} className="px-2 py-1 text-[11px] font-medium"
                style={{ background: days === n ? "var(--accent)" : "var(--surface2)", color: days === n ? "var(--accent-text)" : "var(--text-muted)" }}>
                {n}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {PULSE_CATEGORIES.map(cat => {
          const sparkValues = series.map(d => Number(countsOf(d)[cat.id]) || 0);
          return (
            <button
              key={cat.id}
              onClick={() => onNavigate && onNavigate(navTarget[cat.id])}
              className="rounded-lg p-2 text-left flex flex-col gap-1"
              style={{ background: "var(--surface2)", border: `1px solid ${cat.color}33`, cursor: "pointer", transition: "all var(--transition-fast)" }}
              onMouseEnter={e => { e.currentTarget.style.background = `${cat.color}15`; e.currentTarget.style.borderColor = `${cat.color}88`; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.borderColor = `${cat.color}33`; }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-base leading-none">{cat.icon}</span>
                <span className="text-[10px] uppercase tracking-wider truncate" style={{ color: "var(--text-muted)" }}>{cat.label}</span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-xl font-bold font-mono leading-none" style={{ color: cat.color }}>{totals[cat.id]}</div>
                <MiniSpark values={sparkValues} color={cat.color} height={20} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Stacked area chart */}
      <ActivityPulseChart days={series} height={170} />

      {/* Day labels */}
      <div className="flex justify-between text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>
        <span>{series[0]?.label}</span>
        <span>{series[Math.floor(series.length / 2)]?.label}</span>
        <span>Today</span>
      </div>

      {/* Insight strip */}
      <div className="mt-4 pt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
        <div>
          <span className="opacity-60">Trend:</span>{" "}
          <span style={{ color: trendPct >= 0 ? CYAN : SLATE, fontWeight: 600 }}>
            {trendPct >= 0 ? "↑" : "↓"} {Math.abs(trendPct)}%
          </span>{" "}
          <span className="opacity-60">vs prior {Math.floor(days / 2)} days</span>
        </div>
        <div>
          <span className="opacity-60">Busiest day:</span>{" "}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{busiestDay.weekday} {busiestDay.label}</span>{" "}
          <span className="opacity-60">({busiestDay.tot} events)</span>
        </div>
        <div>
          <span className="opacity-60">Avg/day:</span>{" "}
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{Math.round(grandTotal / days)} events</span>
        </div>
      </div>
    </div>
  );
}

function DonutChart({ segments, size = 140 }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className="text-xs text-center py-8" style={{ color: "var(--text-muted)" }}>No leads yet</div>;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Tooltip
          cursor={false}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          itemStyle={{ color: "var(--text)" }}
        />
        <Pie data={segments} dataKey="value" nameKey="label" innerRadius={size / 2 - 28} outerRadius={size / 2 - 7} paddingAngle={2} stroke="var(--surface)" strokeWidth={3}>
          {segments.map((seg) => <Cell key={seg.label} fill={seg.color} />)}
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-2xl font-bold" style={{ color: "var(--text)" }}>{total}</div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Leads</div>
      </div>
    </div>
  );
}

function FunnelBar({ label, count, max, color }) {
  const pct = max > 0 ? Math.max(8, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-[11px] capitalize shrink-0 truncate" style={{ color: "var(--text-muted)" }}>{label.replace(/_/g, " ")}</div>
      <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: "var(--surface2)" }}>
        <div className="h-full flex items-center px-2 text-[11px] font-semibold" style={{ width: pct + "%", background: color, color: chartFillTextColor(color), minWidth: count > 0 ? "28px" : "0", transition: "width var(--transition-smooth)" }}>
          {count > 0 ? count : ""}
        </div>
      </div>
    </div>
  );
}

function CommandCenterDashboardLoader({ onLogoReady }) {
  const [logoReady, setLogoReady] = useState(false);
  const logoReadyRef = useRef(false);
  const markLogoReady = useCallback(() => {
    if (logoReadyRef.current) return;
    logoReadyRef.current = true;
    setLogoReady(true);
    onLogoReady?.();
  }, [onLogoReady]);

  const handleLogoLoad = useCallback((event) => {
    const image = event.currentTarget;
    if (image.decode) {
      image.decode().then(markLogoReady).catch(markLogoReady);
      return;
    }
    markLogoReady();
  }, [markLogoReady]);

  return (
    <div className={`command-dashboard-loader ${BRAND_ASSETS.openOcti ? 'openocti-brand-loader' : ''}`} data-logo-ready={logoReady ? "true" : "false"} role="status" aria-live="polite" aria-label={`Loading ${BRAND_ASSETS.editionName} dashboard`}>
      <div className="command-dashboard-loader-stage" aria-hidden="true">
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-grid" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-vignette" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-glow" />}
        <img className="command-dashboard-loader-logo" src={BRAND_ASSETS.loaderLogo} alt="" loading="eager" decoding="sync" fetchPriority="high" onLoad={handleLogoLoad} onError={markLogoReady} />
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-radar">
          <div className="command-dashboard-loader-radar-sweep">
            <div className="command-dashboard-loader-radar-edge" />
          </div>
        </div>}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-blip" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-ping" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-ping command-dashboard-loader-ping-delay" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-antenna" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-wing command-dashboard-loader-wing-left" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-wing command-dashboard-loader-wing-right" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-dot command-dashboard-loader-dot-left" />}
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-dot command-dashboard-loader-dot-right" />}
      </div>
      <div className="command-dashboard-loader-copy">
        <div className="command-dashboard-loader-title">{BRAND_ASSETS.editionName}</div>
        <div className="command-dashboard-loader-text">
          Loading dashboard
          <span className="command-dashboard-loader-dots" aria-hidden="true">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </div>
      </div>
      <div className="command-dashboard-loader-bar" aria-hidden="true">
        <div className="command-dashboard-loader-bar-fill" />
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboardDataReady, setDashboardDataReady] = useState(false);
  const [loaderLogoReady, setLoaderLogoReady] = useState(false);
  const loadingStartedAtRef = useRef(Date.now());
  const logoReadyAtRef = useRef(null);
  const welcomeAudioStartedRef = useRef(false);
  const handleLoaderLogoReady = useCallback(() => {
    if (!logoReadyAtRef.current) logoReadyAtRef.current = Date.now();
    setLoaderLogoReady(true);
  }, []);

  useEffect(() => {
    if (!loading || welcomeAudioStartedRef.current) return;
    welcomeAudioStartedRef.current = true;
    playQueuedLoginWelcomeAudio({ delayMs: 120 }).catch(() => {});
  }, [loading]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api("/api/leads"),
      api("/api/sponsor-leads"),
      api("/api/clients"),
      api("/api/activities"),
      api("/api/media"),
      api("/api/tasks"),
      api("/api/projects"),
      api("/api/dashboard/pulse"),
    ]).then(([leadsRes, sponsors, clientsRes, activitiesRes, mediaRes, tasksRes, projectsRes, pulseRes]) => {
      const allLeads = leadsRes?.leads || [];
      const leads = allLeads.filter(isDevLead);
      const allSponsorLeads = Array.isArray(sponsors) ? sponsors : [];
      const sponsorLeads = allSponsorLeads.filter(isSponsorPipelineLead);
      const clients = (clientsRes?.clients || []).filter(c => !c.hidden && !(c.tags || []).includes("hidden"));
      const projects = projectsRes?.projects || [];

      const devByStatus = {};
      leads.forEach(l => { devByStatus[l.status] = (devByStatus[l.status] || 0) + 1; });

      const sponsorByStatus = {};
      sponsorLeads.forEach(l => { sponsorByStatus[l.st] = (sponsorByStatus[l.st] || 0) + 1; });
      const sponsorClosed = sponsorLeads.filter(l => l.st === "closed").length;
      const sponsorInterested = sponsorLeads.filter(l => l.st === "interested" || l.st === "follow_up").length;

      const callQueue = sponsorLeads
        .filter(l => ["prospect", "called", "voicemail", "follow_up", "interested"].includes(l.st))
        .sort((a, b) => (a.lc || "").localeCompare(b.lc || ""))
        .slice(0, 10);

      const hotLeads = sponsorLeads
        .filter(l => l.st === "interested" || l.st === "follow_up")
        .sort((a, b) => (b.lc || "").localeCompare(a.lc || ""))
        .slice(0, 6);

      const nestedActiveProjects = clients.reduce((sum, c) => sum + (c.projects || []).filter(p => p.status === "active").length, 0);
      const activeProjectCount = projects.length
        ? projects.filter(p => p.status === "active").length
        : nestedActiveProjects;

      const dailyLeads = buildDailyLeads(sponsorLeads, 30);
      const newLeads30 = dailyLeads.reduce((s, d) => s + d.value, 0);

      const campaignBuckets = { sponsors: 0, newspaper: 0, tda: 0, farrington_dev: 0 };
      allSponsorLeads.forEach(l => {
        const campaign = classifyCampaign(l);
        if (campaignBuckets[campaign] !== undefined) campaignBuckets[campaign]++;
      });
      const donutSegments = [
        { label: "Sponsors",       value: campaignBuckets.sponsors,       color: CAMPAIGN_COLORS.sponsors },
        { label: "Newspapers",     value: campaignBuckets.newspaper,      color: CAMPAIGN_COLORS.newspaper },
        { label: "TDAs",           value: campaignBuckets.tda,            color: CAMPAIGN_COLORS.tda },
        { label: "Farrington Dev", value: campaignBuckets.farrington_dev, color: CAMPAIGN_COLORS.farrington_dev },
      ].filter(s => s.value > 0);

      // Activity pulse — multi-series daily activity across 6 categories, last 7/14/30 days.
      const activities = activitiesRes?.activities || [];
      const mediaItems = mediaRes?.items || [];
      const tasks = tasksRes?.tasks || [];
      const activityPulse = {
        d7:  buildDailyActivity({ activities, media: mediaItems, tasks, days: 7 }),
        d14: buildDailyActivity({ activities, media: mediaItems, tasks, days: 14 }),
        d30: buildDailyActivity({ activities, media: mediaItems, tasks, days: 30 }),
      };
      const pulseFromServer = pulseRes?.pulse || null;

      if (!mounted) return;
      setData({
        devLeadCount: leads.length, devByStatus,
        sponsorCount: sponsorLeads.length, sponsorByStatus, sponsorClosed, sponsorInterested,
        clientCount: clients.length,
        activeProjectCount,
        callQueue, hotLeads,
        dailyLeads, newLeads30,
        donutSegments,
        activityPulse: pulseFromServer || activityPulse,
      });
      setDashboardDataReady(true);
    }).catch((error) => {
      // Previously uncaught: any fault in this handler left the loader spinning
      // forever with nothing logged. Fall back to an empty-but-valid shape.
      console.error("[dashboard] data load failed:", error);
      reportClientError(error, { kind: "dashboard-load" });
      if (!mounted) return;
      setData({
        devLeadCount: 0, devByStatus: {},
        sponsorCount: 0, sponsorByStatus: {}, sponsorClosed: 0, sponsorInterested: 0,
        clientCount: 0, activeProjectCount: 0,
        callQueue: [], hotLeads: [],
        dailyLeads: [], newLeads30: 0,
        donutSegments: [],
        activityPulse: { d7: [], d14: [], d30: [] },
        loadError: true,
      });
      setDashboardDataReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!dashboardDataReady || !loaderLogoReady) return;
    const logoVisibleMs = Date.now() - (logoReadyAtRef.current || Date.now());
    const totalVisibleMs = Date.now() - loadingStartedAtRef.current;
    const remainingLoaderMs = Math.max(0, 900 - logoVisibleMs, 1400 - totalVisibleMs);
    const timer = window.setTimeout(() => setLoading(false), remainingLoaderMs);
    return () => window.clearTimeout(timer);
  }, [dashboardDataReady, loaderLogoReady]);

  if (loading) {
    return <CommandCenterDashboardLoader onLogoReady={handleLoaderLogoReady} />;
  }
  if (!data) return null;

  const maxSponsorStatus = Math.max(1, ...Object.values(data.sponsorByStatus));
  const maxDevStatus = Math.max(1, ...Object.values(data.devByStatus));

  return (
    <div className="command-workspace p-6 stagger-children" style={{ color: "var(--text)" }}>
      <PageHeader
        icon={<CommandCenterIcon />}
        title="Command Center Dashboard"
        subtitle={`Farrington Development Command Center - ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
      />

      <OpenOctiFirstRun />

      <div className="command-stat-grid grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon="🎯" label="Dev Pipeline"     value={data.devLeadCount + " leads"}       sub={(data.devByStatus.new || data.devByStatus.discovery || 0) + " new · " + (data.devByStatus.qualified || 0) + " qualified"} onClick={() => onNavigate("leads")} />
        <StatCard icon="💼" label="Sponsor Pipeline" value={data.sponsorCount + " leads"}       sub={data.sponsorInterested + " hot · " + data.sponsorClosed + " won"} onClick={() => onNavigate("leads")} />
        <StatCard icon="👤" label="Active Clients"   value={data.clientCount}                    sub="Profiles & projects" onClick={() => onNavigate("accounts")} />
        <StatCard icon="📁" label="Active Projects"  value={data.activeProjectCount}             sub={data.activeProjectCount === 1 ? "in flight" : "in flight"} onClick={() => onNavigate("projects")} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ActivityPulseCard pulse={data.activityPulse || { d7: [], d14: [], d30: [] }} onNavigate={onNavigate} />

        <SiteNoteCard />

        <div className="rounded-xl p-5 flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="mb-3">
            <h2 className="text-base font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>Lead Mix</h2>
            <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>By campaign</div>
          </div>
          <div className="flex-1 flex items-center justify-center py-2">
            <DonutChart segments={data.donutSegments} size={140} />
          </div>
          {data.donutSegments.length > 0 && (
            <div className="mt-2 space-y-1">
              {data.donutSegments.map((seg, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
                  <span className="flex-1 truncate" style={{ color: "var(--text-muted)" }}>{seg.label}</span>
                  <span className="font-medium font-mono">{seg.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Funnels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="mb-4">
            <h2 className="text-base font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>Sponsor Pipeline Funnel</h2>
            <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>By status</div>
          </div>
          {Object.keys(data.sponsorByStatus).length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>No sponsor leads yet</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.sponsorByStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <FunnelBar key={status} label={status} count={count} max={maxSponsorStatus} color={STS_COLORS[status] || "#94a3b8"} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="mb-4">
            <h2 className="text-base font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>Dev Pipeline Funnel</h2>
            <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>By stage</div>
          </div>
          {Object.keys(data.devByStatus).length === 0 ? (
            <p className="text-xs py-4 text-center" style={{ color: "var(--text-muted)" }}>No dev leads yet</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.devByStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <FunnelBar key={status} label={status} count={count} max={maxDevStatus} color={DEV_STS_COLORS[status] || "#94a3b8"} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>📞 Call Queue</h2>
            <button onClick={() => onNavigate("leads")} className="text-xs font-medium px-2 py-1 rounded-md" style={{ color: "var(--accent)", background: "var(--surface2)" }}>View All →</button>
          </div>
          {data.callQueue.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>No calls in queue — nice work!</p>
          ) : (
            <div className="space-y-2">
              {data.callQueue.map(lead => (
                <button key={lead.id} onClick={() => onNavigate("leads")}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: "var(--surface2)", transition: "all var(--transition-fast)" }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STS_COLORS[lead.st] || "#94a3b8" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{lead.bn}</div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{lead.cn || "No contact"} · {lead.cat}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium" style={{ color: STS_COLORS[lead.st] }}>{lead.st.replace(/_/g, " ")}</div>
                    {lead.ph && <CallButton phone={lead.ph} name={lead.cn || lead.bn} className="text-xs hover:underline" stopPropagation />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>🔥 Hot Leads</h2>
            <button onClick={() => onNavigate("leads")} className="text-xs font-medium px-2 py-1 rounded-md" style={{ color: "var(--accent)", background: "var(--surface2)" }}>View All →</button>
          </div>
          {data.hotLeads.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>No hot leads yet — keep working the queue.</p>
          ) : (
            <div className="space-y-2">
              {data.hotLeads.map(lead => (
                <button key={lead.id} onClick={() => onNavigate("leads")}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: "var(--surface2)", transition: "all var(--transition-fast)" }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STS_COLORS[lead.st] || "#94a3b8" }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{lead.bn}</div>
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{lead.cn || "No contact"} · {lead.cat || "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: STS_COLORS[lead.st] }}>{lead.st.replace(/_/g, " ")}</div>
                    {lead.lc && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{new Date(lead.lc).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, onClick }) {
  return (
    <button onClick={onClick} className="text-left rounded-xl p-4 glow-hover"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", transition: "all var(--transition-base)" }}>
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-muted)", fontFamily: "'Outfit', sans-serif" }}>{label}</div>
      <div className="text-xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</div>
    </button>
  );
}
