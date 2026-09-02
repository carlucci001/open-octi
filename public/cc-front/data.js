/* ============================================================
   FARRINGTON — mock data + copy library
   ============================================================ */
(function () {
  // ---- The flagship person: Marge ----
  const USER = {
    firstName: "Marge",
    business: "Blue Ridge Plumbing & Co.",
    email: "redacted@example.invalid",
    vertical: "Construction & Trades",
    region: "Western North Carolina",
  };

  // ---- 10 plumber leads, Western NC (realistic mock) ----
  const LEADS = [
    { biz: "Summit Drain & Rooter",        contact: "Dale Whitmore",   phone: "PHONE_REDACTED", email: "redacted@example.invalid",       town: "Asheville, NC",     source: "Google Business" },
    { biz: "Hendersonville Plumbing Works",contact: "Renee Coffey",    phone: "PHONE_REDACTED", email: "redacted@example.invalid",     town: "Hendersonville, NC",source: "Google Business" },
    { biz: "Pisgah Pipe & Fixture",        contact: "Theo Banks",      phone: "PHONE_REDACTED", email: "redacted@example.invalid",        town: "Brevard, NC",       source: "Yelp" },
    { biz: "Black Mountain Mechanical",    contact: "Lacey Ortega",    phone: "PHONE_REDACTED", email: "redacted@example.invalid",     town: "Black Mountain, NC",source: "Google Business" },
    { biz: "Smoky Ridge Plumbers",         contact: "Hank Pruitt",     phone: "PHONE_REDACTED", email: "redacted@example.invalid",     town: "Waynesville, NC",   source: "Angi" },
    { biz: "Weaverville Water & Drain",    contact: "Priya Nair",      phone: "PHONE_REDACTED", email: "redacted@example.invalid",          town: "Weaverville, NC",   source: "Google Business" },
    { biz: "Fletcher Family Plumbing",     contact: "Gus Holloway",    phone: "PHONE_REDACTED", email: "redacted@example.invalid",  town: "Fletcher, NC",      source: "Facebook" },
    { biz: "Arden Rapid Rooter",           contact: "Maya Delgado",    phone: "PHONE_REDACTED", email: "redacted@example.invalid",   town: "Arden, NC",         source: "Yelp" },
    { biz: "Canton Pipeworks LLC",         contact: "Otis Vance",      phone: "PHONE_REDACTED", email: "redacted@example.invalid",   town: "Canton, NC",        source: "Google Business" },
    { biz: "Marion Mountain Plumbing",     contact: "Brett Sizemore",  phone: "PHONE_REDACTED", email: "redacted@example.invalid",     town: "Marion, NC",        source: "Angi" },
  ];

  // ---- Starter prompts, by vibe (Lead Sweep first) ----
  const STARTERS = [
    { id: "lead-sweep",  template: "Lead Sweep",  icon: "leads",
      text: "Find me 10 plumber leads in Western North Carolina every morning",
      blurb: "New local leads in your industry, delivered on a schedule." },
    { id: "review-watch", template: "Review Radar", icon: "star",
      text: "Email me any new Google review for my business as soon as it lands",
      blurb: "Never miss a review — get pinged the moment one posts." },
    { id: "competitor", template: "Market Watch", icon: "eye",
      text: "Send a weekly summary of what my 3 closest competitors are advertising",
      blurb: "A quiet weekly read on what rivals are up to." },
    { id: "recap", template: "Week in Review", icon: "report",
      text: "Every Friday, summarize my new leads and jobs into a one-page recap",
      blurb: "Your week, distilled to a single page each Friday." },
  ];

  // ---- Placeholder rotation for the request bar ----
  const PLACEHOLDERS = [
    "Find me 10 plumber leads in Western North Carolina every morning…",
    "Email me any new 5-star review the moment it posts…",
    "Send a weekly recap of my new jobs every Friday at 4pm…",
    "Pull 25 new realtor contacts in Asheville each Monday…",
    "Watch for permit filings near me and text me the address…",
  ];

  // ---- Seed automations on the dashboard (after Marge launches, Lead Sweep gets prepended) ----
  const SEED_AUTOMATIONS = [
    {
      id: "auto-mktg",
      template: "Review Radar",
      request: "Email me any new Google review for Blue Ridge Plumbing the moment it posts",
      status: "active",
      cadence: "As it happens",
      nextRun: "Watching now",
      lastRun: "2 hours ago",
      snippet: "Last alert: ★★★★★ “Fast, friendly, fixed it same day.”",
      creditsPerRun: 1,
      runs: [
        { id: "run-rr-2", ranAt: "Today, 11:04 AM", status: "done", credits: 1, kind: "review" },
        { id: "run-rr-1", ranAt: "Yesterday, 6:20 PM", status: "done", credits: 1, kind: "review" },
      ],
    },
    {
      id: "auto-recap",
      template: "Week in Review",
      request: "Every Friday, summarize my new leads and jobs into a one-page recap",
      status: "paused",
      cadence: "Weekly · Fri 4:00 PM",
      nextRun: "Paused",
      lastRun: "Last Friday",
      snippet: "Last recap: 14 new leads, 6 jobs booked, $4,200 pipeline.",
      creditsPerRun: 2,
      runs: [
        { id: "run-wr-1", ranAt: "Fri, 4:00 PM", status: "done", credits: 2, kind: "recap" },
      ],
    },
  ];

  // ---- Lead Sweep automation, created when Marge launches ----
  function makeLeadSweep() {
    return {
      id: "auto-leadsweep",
      template: "Lead Sweep",
      request: "Find me 10 plumber leads in Western North Carolina every morning",
      status: "active",
      cadence: "Every morning · 7:00 AM",
      nextRun: "Tomorrow, 7:00 AM",
      lastRun: "Just now",
      snippet: "Latest: 10 plumber leads across Asheville, Brevard, Canton & more.",
      creditsPerRun: 3,
      flagship: true,
      runs: [],
    };
  }

  // ---- Run-status friendly copy ----
  const STATUS_COPY = {
    building: "Got it — building your automation.",
    running:  "Running now…",
    done:     "Done. 10 plumber leads are ready.",
    paused:   "Paused. We won't run this until you resume.",
    error:    "Something went wrong on our end. We're retrying.",
    empty:    "Out of credits — top up to continue.",
  };

  // ---- Landing content ----
  const OUTCOMES = [
    { vertical: "Construction", featured: true, template: "Lead Sweep",
      req: "Find me 10 plumber leads in Western NC every morning",
      out: "A fresh list of local leads in your inbox by 7 AM." },
    { vertical: "Real Estate", template: "Listing Watch",
      req: "Alert me when a new listing under $400k hits my zip",
      out: "First to know, every time inventory moves." },
    { vertical: "Healthcare", template: "Recall Reach",
      req: "Text patients who are overdue for a cleaning each Monday",
      out: "Chairs filled without the front-desk phone tag." },
    { vertical: "Legal", template: "Intake Triage",
      req: "Summarize new contact-form inquiries and flag the urgent ones",
      out: "Your morning intake, sorted by what matters." },
    { vertical: "Automotive", template: "Service Nudge",
      req: "Remind customers when their service is due, by text",
      out: "Bays booked from the customers you already have." },
    { vertical: "Restaurant", template: "Review Radar",
      req: "Email me any new review the moment it posts",
      out: "Catch every review before it catches you." },
  ];

  const ASKS = [
    "Find 25 new realtor contacts in my county each Monday",
    "Email me a daily list of new commercial permits nearby",
    "Summarize my voicemails into a text every afternoon",
    "Watch for new 5-star reviews and thank each reviewer",
    "Pull this week's job postings hiring for my trade",
    "Send a Friday recap of every new lead and booking",
    "Track 3 competitors' ads and brief me weekly",
    "Find HOAs within 30 miles that need a vendor",
  ];

  const FAQ = [
    { q: "Do I need to be technical?", a: "Not at all. If you can describe what you want in a sentence, you can run an automation. We handle everything behind the scenes." },
    { q: "What if I don't like the result?", a: "Tell us with a thumbs-down and we'll tune it — or edit your request in plain English anytime. Nothing is locked in." },
    { q: "How fast is it?", a: "Most automations are running within a minute of you confirming. Scheduled ones deliver right on time, every time." },
    { q: "How do credits work?", a: "Each run uses a small number of credits — a typical Lead Sweep run is about 3. You start with a free grant and top up only when you want to." },
  ];

  const TESTIMONIALS = [
    { quote: "I described what I wanted in one sentence. Now ten leads land before I've had coffee.", name: "Marge D.", role: "Blue Ridge Plumbing" },
    { quote: "It's like having an assistant who never forgets and never sleeps. I just tell it the outcome.", name: "Carlos M.", role: "Summit Realty" },
    { quote: "No dashboards to learn, no setup. The results just show up where I asked.", name: "Dr. Lena P.", role: "Hendersonville Dental" },
  ];

  // ---- Credit packs ----
  const PACKS = [
    { id: "p1", credits: 100,  price: 19,  note: "Good for a steady week of daily runs" },
    { id: "p2", credits: 300,  price: 49,  note: "Most popular", best: true },
    { id: "p3", credits: 750,  price: 99,  note: "For always-on automations" },
  ];

  window.FARR = {
    USER, LEADS, STARTERS, PLACEHOLDERS, SEED_AUTOMATIONS, makeLeadSweep,
    STATUS_COPY, OUTCOMES, ASKS, FAQ, TESTIMONIALS, PACKS,
  };
})();
