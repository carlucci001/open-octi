'use client'

import { useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  Mail,
  PlugZap,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

const presets = [
  {
    id: 'lead-sweep',
    name: 'Lead Sweep',
    description: 'Find customer targets, import CRM leads, and email a daily list.',
    examples: ['Plumber leads in Western North Carolina', 'Property managers in Asheville', 'Restaurant openings in Buncombe County'],
    credits: '30-80 credits/run',
  },
  {
    id: 'press-list',
    name: 'Press List Builder',
    description: 'Build and refresh media contacts for outreach approval.',
    examples: ['Local editors by beat', 'Event calendars', 'Regional outlet contacts'],
    credits: '20-60 credits/run',
  },
  {
    id: 'competitor-watch',
    name: 'Competitor Watch',
    description: 'Watch sites, offers, reviews, and changes, then send a report.',
    examples: ['Pricing changes', 'New service pages', 'Hiring and market signals'],
    credits: '25-75 credits/run',
  },
]

const proofLeads = [
  'Property Maintenance, Inspections & Repairs',
  'Property Management & Maintenance - Asheville, NC',
  'Contact: Altamus | Regional Property Management Firm',
  'Vesta Property Management contact',
  'Maintenance & Office Requests',
]

const steps = [
  { id: 'goal', label: 'Goal' },
  { id: 'market', label: 'Market' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'review', label: 'Review' },
]

const fieldStyle = {
  width: '100%',
  border: '1px solid #ddd4c2',
  borderRadius: 8,
  padding: '12px 12px',
  color: '#2a2520',
  background: '#fff',
  fontSize: 14,
  outline: 'none',
}

const deliveryOptions = [
  { id: 'dashboard', label: 'Dashboard', description: 'Store results in the client dashboard with run history.' },
  { id: 'email', label: 'Email', description: 'Send a formatted summary to one or more recipients.' },
  { id: 'csv', label: 'CSV download', description: 'Let the client download each run as a spreadsheet.' },
  { id: 'webhook', label: 'Webhook', description: 'POST new results into another app when the run completes.' },
  { id: 'api', label: 'API key', description: 'Let their system pull runs and records programmatically.' },
  { id: 'database', label: 'Database sync', description: 'Push results into Airtable, Sheets, Supabase, or a client database.' },
]

const subscriberSteps = [
  { title: 'Subscribe', body: 'Customer selects a monthly plan, receives starting credits, and gets a private workspace.' },
  { title: 'Describe', body: 'They ask for an outcome in plain English. The wizard turns it into a scoped automation plan.' },
  { title: 'Approve', body: 'They review cost, delivery, and approval gates before any live run spends credits.' },
  { title: 'Receive', body: 'Results land in the dashboard, email, CSV, or a paid integration path.' },
]

const consoleItems = [
  { label: 'Active automations', value: '3', icon: Zap },
  { label: 'Credits remaining', value: '420', icon: CreditCard },
  { label: 'Runs this week', value: '8', icon: Play },
  { label: 'Delivery checks', value: '100%', icon: ShieldCheck },
]

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function automationPlan(form) {
  const business = form.businessType || 'plumber'
  const market = form.market || 'Western North Carolina'
  const count = Number(form.count) || 10
  const campaign = `${slug(market || 'local')}-${slug(business || 'lead')}-leads`
  return {
    title: `${market} ${business} lead sweep`,
    summary: `Find ${count} likely customer targets for a ${business} in ${market}, exclude direct competitors, import CRM leads, and email the results.`,
    campaign,
    tags: ['apify', campaign, 'customer-target'],
    credits: Math.max(35, Math.min(90, count * 6)),
    schedule: form.frequency || 'Manual proof run',
  }
}

function Pill({ children, tone = 'neutral' }) {
  const colors = {
    neutral: ['#eef3f8', '#5d564c'],
    green: ['#e7f8ef', '#19784d'],
    amber: ['#fff4df', '#94631d'],
    blue: ['#f4e2d6', '#7d3a20'],
  }[tone]
  return <span style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '5px 9px', background: colors[0], color: colors[1], fontSize: 12, fontWeight: 700 }}>{children}</span>
}

function Wizard() {
  const [activeStep, setActiveStep] = useState(0)
  const [selectedDelivery, setSelectedDelivery] = useState(['dashboard', 'email'])
  const [form, setForm] = useState({
    businessType: 'plumber',
    market: 'Western North Carolina',
    recipient: 'marge@example.com',
    count: 10,
    frequency: 'Manual proof run',
    approval: 'Review before outreach',
  })
  const plan = useMemo(() => automationPlan(form), [form])

  function update(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function toggleDelivery(id) {
    setSelectedDelivery(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  return (
    <section id="wizard" style={{ maxWidth: 1180, margin: '0 auto', padding: '42px 20px 70px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.95fr) minmax(340px, 1.05fr)', gap: 22, alignItems: 'start' }} className="automation-services-grid">
        <div style={{ background: '#fff', border: '1px solid #e9e2d4', borderRadius: 8, boxShadow: '0 18px 60px rgba(26,45,74,0.08)' }}>
          <div style={{ padding: 18, borderBottom: '1px solid #e9e2d4', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#8b8478', textTransform: 'uppercase' }}>Automation Wizard</div>
              <h2 style={{ margin: '4px 0 0', fontSize: 26, color: '#2a2520' }}>Turn a request into a runnable workflow</h2>
            </div>
            <Pill tone="green">Lead Sweep v1</Pill>
          </div>
          <div style={{ padding: 18, display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #e9e2d4' }}>
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(index)}
                style={{
                  border: '1px solid ' + (activeStep === index ? '#c8643c' : '#ddd4c2'),
                  background: activeStep === index ? '#f4e2d6' : '#fff',
                  color: activeStep === index ? '#7d3a20' : '#5d564c',
                  borderRadius: 999,
                  padding: '8px 11px',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {index + 1}. {step.label}
              </button>
            ))}
          </div>
          <div style={{ padding: 20 }}>
            {activeStep === 0 && (
              <div style={{ display: 'grid', gap: 16 }}>
                <label style={{ display: 'grid', gap: 7, color: '#2a2520', fontWeight: 800 }}>What business is this for?
                  <input style={fieldStyle} value={form.businessType} onChange={event => update('businessType', event.target.value)} />
                </label>
                <label style={{ display: 'grid', gap: 7, color: '#2a2520', fontWeight: 800 }}>What outcome do they want?
                  <textarea style={{ ...fieldStyle, minHeight: 92, resize: 'vertical' }} value={`Find customer targets for a ${form.businessType || 'business'} and email the results.`} onChange={() => {}} />
                </label>
              </div>
            )}
            {activeStep === 1 && (
              <div style={{ display: 'grid', gap: 16 }}>
                <label style={{ display: 'grid', gap: 7, color: '#2a2520', fontWeight: 800 }}>Market or service area
                  <input style={fieldStyle} value={form.market} onChange={event => update('market', event.target.value)} />
                </label>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ color: '#2a2520', fontWeight: 800 }}>Built-in targeting</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['property managers', 'facilities', 'restaurants', 'apartments', 'hotels', 'permits', 'exclude competitors'].map(item => <Pill key={item} tone={item.includes('exclude') ? 'amber' : 'blue'}>{item}</Pill>)}
                  </div>
                </div>
              </div>
            )}
            {activeStep === 2 && (
              <div style={{ display: 'grid', gap: 16 }}>
                <label style={{ display: 'grid', gap: 7, color: '#2a2520', fontWeight: 800 }}>Email results to
                  <input style={fieldStyle} value={form.recipient} onChange={event => update('recipient', event.target.value)} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'grid', gap: 7, color: '#2a2520', fontWeight: 800 }}>Lead count
                    <input type="number" min="1" max="50" style={fieldStyle} value={form.count} onChange={event => update('count', event.target.value)} />
                  </label>
                  <label style={{ display: 'grid', gap: 7, color: '#2a2520', fontWeight: 800 }}>Schedule
                    <select style={fieldStyle} value={form.frequency} onChange={event => update('frequency', event.target.value)}>
                      <option>Manual proof run</option>
                      <option>Every weekday morning</option>
                      <option>Weekly Monday report</option>
                    </select>
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <div>
                    <div style={{ color: '#2a2520', fontWeight: 900 }}>Where should results go?</div>
                    <div style={{ color: '#8b8478', fontSize: 13 }}>Start with dashboard and email. Add webhook, API, CSV, or database sync when the client needs automatic handoff.</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }} className="automation-services-grid-two">
                    {deliveryOptions.map(option => {
                      const checked = selectedDelivery.includes(option.id)
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => toggleDelivery(option.id)}
                          style={{
                            textAlign: 'left',
                            border: '1px solid ' + (checked ? '#c8643c' : '#ddd4c2'),
                            background: checked ? '#f4e2d6' : '#fff',
                            borderRadius: 8,
                            padding: 12,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: checked ? '#7d3a20' : '#2a2520', fontWeight: 900 }}>
                            {checked ? <CheckCircle2 size={16} /> : <PlugZap size={16} />} {option.label}
                          </span>
                          <span style={{ display: 'block', color: '#8b8478', fontSize: 13, marginTop: 5 }}>{option.description}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {activeStep === 3 && (
              <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ background: '#f7fafc', border: '1px solid #e9e2d4', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#8b8478', textTransform: 'uppercase' }}>Plan</div>
                  <h3 style={{ margin: '5px 0', color: '#2a2520' }}>{plan.title}</h3>
                  <p style={{ margin: 0, color: '#5d564c' }}>{plan.summary}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <div style={{ border: '1px solid #e9e2d4', borderRadius: 8, padding: 12 }}><Database size={18} /><strong style={{ display: 'block', marginTop: 6 }}>CRM</strong><span style={{ color: '#8b8478', fontSize: 13 }}>Campaign: {plan.campaign}</span></div>
                  <div style={{ border: '1px solid #e9e2d4', borderRadius: 8, padding: 12 }}><Mail size={18} /><strong style={{ display: 'block', marginTop: 6 }}>Delivery</strong><span style={{ color: '#8b8478', fontSize: 13 }}>{selectedDelivery.map(id => deliveryOptions.find(option => option.id === id)?.label).filter(Boolean).join(', ')}</span></div>
                  <div style={{ border: '1px solid #e9e2d4', borderRadius: 8, padding: 12 }}><CreditCard size={18} /><strong style={{ display: 'block', marginTop: 6 }}>Credits</strong><span style={{ color: '#8b8478', fontSize: 13 }}>Estimate: {plan.credits}</span></div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setActiveStep(Math.max(0, activeStep - 1))} style={{ border: '1px solid #ddd4c2', background: '#fff', color: '#2a2520', borderRadius: 8, padding: '10px 14px', fontWeight: 800, cursor: 'pointer' }}>Back</button>
              <button type="button" onClick={() => setActiveStep(Math.min(3, activeStep + 1))} style={{ border: 0, background: '#c8643c', color: '#fff', borderRadius: 8, padding: '10px 14px', fontWeight: 900, cursor: 'pointer', display: 'inline-flex', gap: 8, alignItems: 'center' }}>{activeStep === 3 ? 'Run test' : 'Next'} <ArrowRight size={16} /></button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ background: '#2a2520', color: '#f8fbff', borderRadius: 8, padding: 20, boxShadow: '0 18px 60px rgba(20,32,51,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#f4e2d6', fontWeight: 900, fontSize: 13, textTransform: 'uppercase' }}><Sparkles size={16} /> Live Proof Pattern</div>
            <h3 style={{ fontSize: 24, margin: '10px 0 8px' }}>Marge WNC plumber sweep</h3>
            <p style={{ margin: '0 0 16px', color: '#d7e2ef' }}>The prototype path already works on the live Command Center: Apify found customer targets, CRM stored leads, Resend emailed the summary, and run history logged proof.</p>
            <div style={{ display: 'grid', gap: 9 }}>
              {['10 leads imported', 'Email delivered', 'Campaign: wnc-plumber-leads', 'Ready for reusable Lead Sweep v1'].map(item => (
                <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#fffdf8' }}><CheckCircle2 size={17} color="#5f7a4f" /> {item}</div>
              ))}
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e9e2d4', borderRadius: 8, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#8b8478', textTransform: 'uppercase', marginBottom: 10 }}>Example Results</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {proofLeads.map((lead, index) => (
                <div key={lead} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: '1px solid #e9e2d4', borderRadius: 8, padding: 10 }}>
                  <span style={{ color: '#2a2520', fontWeight: 800 }}>{lead}</span>
                  <span style={{ color: '#8b8478', fontSize: 13 }}>#{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function AutomationServicesPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#faf7f0', color: '#2a2520', letterSpacing: 0 }}>
      <section style={{ position: 'relative', minHeight: '86vh', display: 'flex', alignItems: 'center', overflow: 'hidden', background: '#faf7f0' }}>
        <img src="/product-covers/command-center-cover.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.34 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(14,26,43,0.96), rgba(14,26,43,0.78) 48%, rgba(14,26,43,0.42))' }} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 1180, margin: '0 auto', padding: '74px 20px 54px' }}>
          <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 68 }}>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: 18 }}>Automation Services</div>
            <a href="#wizard" style={{ color: '#faf7f0', background: '#fff', borderRadius: 8, padding: '10px 14px', textDecoration: 'none', fontWeight: 900 }}>Build a test</a>
          </nav>
          <div style={{ maxWidth: 740 }}>
            <Pill tone="blue">Powered by Farrington Command Center</Pill>
            <h1 style={{ color: '#fff', fontSize: 'clamp(44px, 7vw, 82px)', lineHeight: 0.96, margin: '18px 0 20px', maxWidth: 760 }}>Describe the outcome. We build the automation.</h1>
            <p style={{ color: '#5d564c', fontSize: 21, lineHeight: 1.45, maxWidth: 680, margin: '0 0 28px' }}>Lead sweeps, press lists, competitor reports, and content workflows that run through one operating layer: data sources, CRM records, email delivery, approvals, and credits.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <a href="#wizard" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#fff', background: '#c8643c', borderRadius: 8, padding: '13px 17px', textDecoration: 'none', fontWeight: 900 }}>Start with Lead Sweep <ArrowRight size={18} /></a>
              <a href="#templates" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#fff', border: '1px solid rgba(255,255,255,0.32)', borderRadius: 8, padding: '13px 17px', textDecoration: 'none', fontWeight: 900 }}>See templates</a>
            </div>
          </div>
        </div>
      </section>

      <section id="templates" style={{ maxWidth: 1180, margin: '0 auto', padding: '58px 20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'end', flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#c8643c', textTransform: 'uppercase' }}>Templates</div>
            <h2 style={{ fontSize: 36, margin: '6px 0 0' }}>Sell outcomes, not configuration</h2>
          </div>
          <p style={{ maxWidth: 440, margin: 0, color: '#5d564c' }}>Each template is a packaged path through the same Command Center orchestration layer.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }} className="automation-services-grid-three">
          {presets.map(preset => (
            <article key={preset.id} style={{ background: '#fff', border: '1px solid #e9e2d4', borderRadius: 8, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 22 }}>{preset.name}</h3>
                <Pill tone="amber">{preset.credits}</Pill>
              </div>
              <p style={{ color: '#5d564c', margin: '0 0 14px' }}>{preset.description}</p>
              <div style={{ display: 'grid', gap: 7 }}>
                {preset.examples.map(example => <div key={example} style={{ display: 'flex', gap: 8, color: '#2a2520', fontSize: 14 }}><Search size={15} color="#c8643c" /> {example}</div>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(360px, 1.1fr)', gap: 16, alignItems: 'stretch' }} className="automation-services-grid">
          <div style={{ background: '#fff', border: '1px solid #e9e2d4', borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#c8643c', textTransform: 'uppercase' }}>Subscriber Flow</div>
            <h2 style={{ fontSize: 34, margin: '8px 0 10px' }}>A sellable front door, not another internal tool</h2>
            <p style={{ color: '#5d564c', margin: '0 0 18px', fontSize: 16 }}>This route is the placeholder storefront and customer console for the unnamed SaaS. The mechanics stay in Command Center; customers only see outcomes, approvals, credits, and results.</p>
            <div style={{ display: 'grid', gap: 10 }}>
              {subscriberSteps.map((step, index) => (
                <div key={step.title} style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 10, alignItems: 'start' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: '#f4e2d6', color: '#7d3a20', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{index + 1}</span>
                  <span>
                    <strong style={{ display: 'block', color: '#2a2520' }}>{step.title}</strong>
                    <span style={{ display: 'block', color: '#8b8478', fontSize: 14 }}>{step.body}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: '#2a2520', color: '#f8fbff', borderRadius: 8, padding: 18, display: 'grid', gap: 14, boxShadow: '0 18px 60px rgba(20,32,51,0.16)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: '#f4e2d6', textTransform: 'uppercase' }}>Client Console Preview</div>
                <h3 style={{ margin: '4px 0 0', fontSize: 26 }}>Blue Ridge Plumbing</h3>
              </div>
              <Pill tone="green">Professional plan</Pill>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }} className="automation-services-grid-four">
              {consoleItems.map(item => (
                <div key={item.label} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: 12 }}>
                  <item.icon size={18} color="#f4e2d6" />
                  <strong style={{ display: 'block', marginTop: 9, fontSize: 21 }}>{item.value}</strong>
                  <span style={{ color: '#5d564c', fontSize: 12 }}>{item.label}</span>
                </div>
              ))}
            </div>
            <div style={{ background: '#fff', color: '#2a2520', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <strong>Latest run</strong>
                <span style={{ color: '#19784d', fontWeight: 900, fontSize: 13 }}>Delivered</span>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {['10 WNC customer targets found', 'CRM records created under client workspace', 'Email and CSV delivery queued'].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2a2520', fontSize: 14 }}><CheckCircle2 size={16} color="#19784d" /> {item}</div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }} className="automation-services-grid-three">
              {['Dashboard', 'Automations', 'Billing'].map(item => (
                <button key={item} type="button" style={{ border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#f8fbff', borderRadius: 8, padding: '10px 12px', fontWeight: 900 }}>{item}</button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Wizard />

      <section style={{ background: '#fff', borderTop: '1px solid #e9e2d4' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '42px 20px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="automation-services-grid-four">
          {[
            [Zap, 'Build credits', 'Used when the system plans or updates an automation.'],
            [Play, 'Run credits', 'Used when Apify, agents, or enrichment work is executed.'],
            [ShieldCheck, 'Approval gates', 'Hold outreach or spend until the owner approves.'],
            [Clock3, 'Run history', 'Every result, error, cost, and email delivery stays visible.'],
          ].map(([Icon, title, body]) => (
            <div key={title} style={{ border: '1px solid #e9e2d4', borderRadius: 8, padding: 16 }}>
              <Icon size={22} color="#c8643c" />
              <h3 style={{ margin: '10px 0 6px', fontSize: 18 }}>{title}</h3>
              <p style={{ margin: 0, color: '#5d564c', fontSize: 14 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: '#faf7f0', borderTop: '1px solid #e9e2d4' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '50px 20px 58px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'end', flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#c8643c', textTransform: 'uppercase' }}>Connection Layer</div>
              <h2 style={{ fontSize: 34, margin: '6px 0 0' }}>Results can leave the dashboard</h2>
            </div>
            <p style={{ maxWidth: 480, margin: 0, color: '#5d564c' }}>The first version should ship with dashboard, email, and CSV. Webhooks, API keys, and database sync become paid integration options once the run contract is stable.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }} className="automation-services-grid-three">
            {deliveryOptions.map(option => (
              <div key={option.id} style={{ background: '#fff', border: '1px solid #e9e2d4', borderRadius: 8, padding: 16 }}>
                <PlugZap size={20} color="#c8643c" />
                <h3 style={{ margin: '10px 0 6px', fontSize: 19 }}>{option.label}</h3>
                <p style={{ margin: 0, color: '#5d564c', fontSize: 14 }}>{option.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style jsx>{`
        @media (max-width: 880px) {
          .automation-services-grid,
          .automation-services-grid-three,
          .automation-services-grid-four,
          .automation-services-grid-two {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  )
}
