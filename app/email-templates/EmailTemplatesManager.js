'use client'
// Standalone Email Templates page — edit the lead follow-up letters without
// opening a lead. Same data as the email modal's "Edit templates"
// (/api/email-templates); this is just a front door for it. Reached from the
// Leads header button or by nav/voice ("email templates"). Not a sidebar item,
// per the no-menu-sprawl rule.
import PageHeader, { LabHeaderButton } from '../components/PageHeader'
import EmailTemplateEditor from '../components/EmailTemplateEditor'
import { Mail } from 'lucide-react'

export default function EmailTemplatesManager({ onNavigate }) {
  return (
    <div>
      <PageHeader
        icon={<Mail size={20} />}
        title="Email Templates"
        subtitle="The letters behind one-click lead follow-up — edit here, no lead required"
        actions={(
          <LabHeaderButton
            onClick={() => onNavigate?.('leads')}
            label="Back to leads"
            icon={(
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            )}
          />
        )}
      />
      <div className="max-w-3xl">
        <EmailTemplateEditor />
      </div>
    </div>
  )
}
