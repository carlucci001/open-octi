// Project-completion review email.
//
// When a client project crosses the finish line (progress reaches 100 or
// status flips to completed), the client automatically gets a thank-you email
// that asks for a Google review of Farrington Development, with the official
// review link from the verified Google Business Profile (pulled from Carl's
// GBP dashboard 2026-08-10).
//
// The letter lives in email-templates.json as 'fd-project-complete' — Carl
// edits it on the Email Templates page like any other letter; the hardcoded
// DEFAULT below is only the fallback if that template is ever deleted.
//
// Sends AT MOST ONCE per project (completionEmailSentAt stamp). Internal
// projects and projects whose account has no email never send; both outcomes
// are logged as activities so nothing fails silently.
import { Resend } from 'resend'
import { readData } from './dataStore'
import { findById, loadAll, update, logActivity } from './entityStore'

export const GOOGLE_REVIEW_LINK = 'https://g.page/r/CZxMiBSVXUikEBM/review'
const FROM = 'Farrington Development <redacted@example.invalid>'
const TEMPLATE_ID = 'fd-project-complete'

const DEFAULT_TEMPLATE = {
  subject: '{project} is complete — thank you from Farrington Development',
  body: 'Hi {contact},\n\nGreat news — {project} is finished and delivered. Thank you for trusting Farrington Development with it.\n\nIt was a pleasure building this for {company}. If anything needs a tweak now that it’s in your hands, just reply to this email — taking care of you after delivery is part of the job.\n\nOne small favor: reviews from real clients are how a business like ours lives and grows. If you were happy with the work, would you take sixty seconds and share a quick review?\n\nLeave a review: {reviewLink}\n\nIt means more than you know. Thank you again — and when the next project comes up, you know where to find me.\n\nCarl Farrington\nFarrington Development\nfarringtondevelopment.com',
}

function getTemplate() {
  try {
    const data = readData('email-templates.json')
    const templates = Array.isArray(data) ? data : data?.templates
    const t = (templates || []).find(x => x.id === TEMPLATE_ID)
    if (t?.subject && t?.body) return t
  } catch {}
  return DEFAULT_TEMPLATE
}

const fill = (text, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), String(text || ''))

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

// Plain text → simple branded HTML. Bare URLs become real links (the review
// link must be clickable), and the review link additionally gets a button.
function htmlBody(text) {
  const escaped = escapeHtml(text)
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" style="color:#0b7285;">${url}</a>`)
  const withButton = linked.replace(
    /Leave a review: (<a [^>]+>[^<]+<\/a>)/,
    m => `${m}<br /><br /><a href="${GOOGLE_REVIEW_LINK}" style="display:inline-block;background:#0b7285;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;">Review Farrington Development on Google</a>`,
  )
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:640px;margin:0 auto;padding:24px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">Farrington Development</div>
      <div style="font-size:15px;">${withButton.replace(/\n/g, '<br />')}</div>
    </div>
  `
}

// Call from the projects update path with the record before and after the
// write. Decides on its own whether this update is a completion transition.
export async function maybeSendProjectCompletionEmail({ prev, rec }) {
  try {
    if (!rec || rec.isInternal || !rec.accountId) return { skipped: 'internal or no account' }
    const nowDone = Number(rec.progress) >= 100 || rec.status === 'completed'
    const wasDone = Number(prev?.progress) >= 100 || prev?.status === 'completed'
    if (!nowDone || wasDone) return { skipped: 'not a completion transition' }
    if (prev?.completionEmailSentAt || rec.completionEmailSentAt) return { skipped: 'already sent' }

    const account = findById('accounts', rec.accountId)
    const contacts = loadAll('contacts').filter(c => c.accountId === rec.accountId)
    const primary = contacts.find(c => c.primary && c.email) || contacts.find(c => c.email)
    const to = String(account?.email || primary?.email || '').trim()
    if (!to.includes('@')) {
      logActivity({
        type: 'note',
        subject: `⚠ Completion email NOT sent — no client email on ${account?.name || rec.accountId}`,
        body: `Project "${rec.name}" hit 100%, but the account has no email address. Add one and re-save the project at 100% to send.`,
        linkedTo: { projectId: rec.id, accountId: rec.accountId },
      })
      return { skipped: 'no client email' }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      logActivity({ type: 'note', subject: '⚠ Completion email NOT sent — RESEND_API_KEY missing', linkedTo: { projectId: rec.id, accountId: rec.accountId } })
      return { skipped: 'resend not configured' }
    }

    const tpl = getTemplate()
    const vars = {
      contact: primary?.name || account?.name || 'there',
      company: account?.name || 'your team',
      project: rec.name || 'your project',
      reviewLink: GOOGLE_REVIEW_LINK,
      brand: 'Farrington Development',
    }
    const subject = fill(tpl.subject, vars)
    const bodyText = fill(tpl.body, vars)

    const resend = new Resend(apiKey)
    const result = await resend.emails.send({ from: FROM, to: [to], subject, text: bodyText, html: htmlBody(bodyText) })
    if (result?.error) throw new Error(result.error.message || 'Resend rejected the send')

    update('projects', rec.id, { completionEmailSentAt: new Date().toISOString(), completionEmailTo: to })
    logActivity({
      type: 'email',
      subject: `Completion + review email sent: ${rec.name}`,
      body: `To: ${to}\nSubject: ${subject}\nReview link: ${GOOGLE_REVIEW_LINK}`,
      linkedTo: { projectId: rec.id, accountId: rec.accountId },
    })
    return { ok: true, to }
  } catch (err) {
    try {
      logActivity({
        type: 'note',
        subject: `⚠ Completion email FAILED for ${rec?.name || 'project'}: ${err.message}`,
        linkedTo: { projectId: rec?.id, accountId: rec?.accountId || null },
      })
    } catch {}
    return { error: err.message }
  }
}
