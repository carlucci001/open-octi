function clean(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function buildPressReceiptProofMessages({ inbox, runId, timestamp = new Date().toISOString() } = {}) {
  const recipient = clean(inbox, 254)
  const proofRun = clean(runId, 100)
  if (!recipient || !recipient.includes('@')) throw new Error('PRESS_TEST_INBOX is required for receipt proof')
  if (!proofRun) throw new Error('Receipt proof run id is required')
  const shared = { to: recipient, replyTo: recipient }
  return [
    {
      ...shared,
      kind: 'distribution',
      subject: `Press Desk distribution receipt — ${proofRun}`,
      text: `Distribution receipt\n\nRun: ${proofRun}\nTimestamp: ${timestamp}\nMode: Authorized PR3b test-inbox proof\nRecipients: PRESS_TEST_INBOX only\nJournalist messages sent: 0\n`,
    },
    {
      ...shared,
      kind: 'order',
      subject: `Press Desk order receipt — ${proofRun}`,
      text: `Order receipt\n\nRun: ${proofRun}\nTimestamp: ${timestamp}\nService: Monthly press release\nAmount: $249.00 monthly\nMode: Authorized PR3b test-inbox proof\nRecipient: PRESS_TEST_INBOX only\n`,
    },
  ]
}

