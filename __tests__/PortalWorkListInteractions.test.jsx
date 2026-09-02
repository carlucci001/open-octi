import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'app/portal/support/page.js'), 'utf8')

describe('Portal Work compact list interactions', () => {
  it('places New Ticket in the left/first column and Existing Work second on wide and narrow layouts', () => {
    const layoutStart = source.indexOf("gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))'")
    const createStart = source.indexOf('id="new-support-request"', layoutStart)
    const existingStart = source.indexOf('>Tickets</div>', layoutStart)

    expect(layoutStart).toBeGreaterThan(-1)
    expect(createStart).toBeGreaterThan(layoutStart)
    expect(existingStart).toBeGreaterThan(createStart)
  })

  it('keeps full text out of list rows and uses a native keyboard-accessible detail button', () => {
    expect(source).toContain('aria-label={`Open ${ticket.subject} details`}')
    expect(source).toContain('onClick={event => openTicket(ticket.id, event.currentTarget)}')
    expect(source).toContain('<button')
    expect(source).toContain('{selected.description}')
    expect(source).not.toContain('{t.description}')
  })

  it('contains full details in an accessible scrollable dialog with close, Escape, and focus return', () => {
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain('detailTriggerRef.current?.focus()')
    expect(source).toContain('aria-label="Close work request details"')
    expect(source).toContain("maxHeight: 'min(82vh, 760px)'")
    expect(source).toContain("overflowY: 'auto'")
  })

  it('uses sibling archive and restore controls with server-backed archive filtering', () => {
    expect(source).toContain("const [archiveState, setArchiveState] = useState('active')")
    expect(source).toContain('archiveState,')
    expect(source).toContain("action: ticket.archivedAt ? 'restore' : 'archive'")
    expect(source).toContain('aria-label={`${ticket.archivedAt ? \'Restore\' : \'Archive\'} ${ticket.subject}`}')
    expect(source).toContain('<option value="archived">Archived</option>')
    expect(source).toContain('<option value="all">All</option>')
    expect(source).not.toMatch(/>\s*Delete (?:ticket|request)\s*</i)
    expect(source).not.toContain("action: 'delete'")
  })
})
