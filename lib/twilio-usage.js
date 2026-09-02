const total = payload => (payload?.usage_records || []).reduce((sum, record) => {
  const price = Number(record?.price)
  return sum + (Number.isFinite(price) ? Math.abs(price) : 0)
}, 0)

const currency = (...payloads) => {
  for (const payload of payloads) {
    const unit = (payload?.usage_records || []).find(record => record?.price_unit)?.price_unit
    if (unit) return String(unit).toUpperCase()
  }
  return 'USD'
}

export async function fetchTwilioUsage({
  accountSid = process.env.TWILIO_ACCOUNT_SID,
  keySid = process.env.TWILIO_API_KEY_SID,
  keySecret = process.env.TWILIO_API_KEY_SECRET,
  fetchImpl = fetch,
} = {}) {
  if (!accountSid || !keySid || !keySecret) return { configured: false }

  const headers = { Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString('base64')}` }
  const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Usage/Records`
  const options = { headers, cache: 'no-store', signal: AbortSignal.timeout(15_000) }
  const [todayResponse, monthResponse] = await Promise.all([
    fetchImpl(`${base}/Today.json?Category=totalprice&PageSize=10`, options),
    fetchImpl(`${base}/ThisMonth.json?Category=totalprice&PageSize=10`, options),
  ])

  if (!todayResponse.ok || !monthResponse.ok) {
    const status = !todayResponse.ok ? todayResponse.status : monthResponse.status
    throw new Error(`Twilio returned HTTP ${status}`)
  }

  const [today, month] = await Promise.all([todayResponse.json(), monthResponse.json()])
  return {
    configured: true,
    costToday: total(today),
    costMonth: total(month),
    currency: currency(today, month),
  }
}
