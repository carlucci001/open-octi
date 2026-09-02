'use client'

export const RELATIONSHIP_LIFECYCLE_TABS = ['leads', 'lead-intake', 'outreach-campaigns', 'pipelines', 'accounts', 'contacts', 'projects']

const RELATIONSHIP_FLOW = [
  { id: 'lead-intake', label: 'Intake', detail: 'Raw leads' },
  { id: 'lead-intake', label: 'Qualify', detail: 'MAN gate' },
  { id: 'pipelines', label: 'Opportunity', detail: 'Active deal' },
  { id: 'accounts', label: 'Client', detail: 'Company record' },
  { id: 'projects', label: 'Project', detail: 'Won work' },
]

export default function RelationshipLifecycleStrip({ activeTab, onNavigate, className = '' }) {
  const canNavigate = typeof onNavigate === 'function'

  return (
    <div className={`relationship-lifecycle-strip ${className}`.trim()} aria-label="Relationship lifecycle">
      {RELATIONSHIP_FLOW.map((step, index) => {
        const active = step.id === activeTab || (activeTab === 'contacts' && step.id === 'accounts')
        return (
          <button
            key={`${step.label}-${index}`}
            type="button"
            onClick={() => canNavigate && onNavigate(step.id)}
            disabled={!canNavigate}
            aria-current={active ? 'step' : undefined}
            className="relationship-lifecycle-step"
            data-active={active ? 'true' : 'false'}
          >
            <span className="relationship-lifecycle-step-index">Step {index + 1}</span>
            <span className="relationship-lifecycle-step-label">{step.label}</span>
            <span className="relationship-lifecycle-step-detail">{step.detail}</span>
          </button>
        )
      })}
    </div>
  )
}
