// Standard operating procedure for setting up a vendor / SaaS / API account.
// Single source of truth so every vendor setup is done the same way — and, when it's for a
// client, nothing that should land on their invoice gets missed.

export const VENDOR_SETUP_STEPS = [
  'Create the account with the vendor (use the business email; note which entity owns it).',
  'Pick the plan / tier and confirm the price and billing cadence.',
  'Generate the API key / credentials needed for the work.',
  'Store the key in the vault — never leave it only in email or chat.',
  'Add the vendor to Overhead and tag it to the project(s) / client(s) it serves.',
  'If it was set up for a client, mark the link Billable so it can be charged.',
  'Add the cost to the client invoice (or the next billing run) for billable links.',
  'Confirm login URL and payment method are recorded on the Overhead entry.',
]

// Build a task description (markdown checklist) for a specific vendor setup.
export function buildVendorSetupTask({ vendor, forName, billable }) {
  const lines = [
    `Standard setup for **${vendor || 'new vendor'}**${forName ? ` for ${forName}` : ''}.`,
    '',
    ...VENDOR_SETUP_STEPS.map(s => `- [ ] ${s}`),
  ]
  if (billable) lines.push('', `> Billable to ${forName || 'the client'} — make sure it reaches the invoice.`)
  return lines.join('\n')
}
