const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0

export function scoreCampaignSignal({ cashOnHand = 0, office = '', electionDate = null, email = '', phone = '', now = new Date() } = {}) {
  const cash = amount(cashOnHand)
  const officeCeiling = String(office).toUpperCase() === 'P' ? 8 : String(office).toUpperCase() === 'S' ? 7 : 6
  const budget = Math.min(100, Math.round((Math.log10(cash + 1) / officeCeiling) * 100))
  const days = electionDate ? Math.ceil((new Date(electionDate).getTime() - new Date(now).getTime()) / 86400000) : null
  const urgency = days === null || Number.isNaN(days) ? 0 : days < 0 ? 10 : days <= 30 ? 100 : days <= 60 ? 85 : days <= 90 ? 70 : days <= 180 ? 40 : 15
  const reachability = email && phone ? 100 : email || phone ? 60 : 0
  return {
    budget,
    urgency,
    reachability,
    total: Math.round(budget * 0.5 + urgency * 0.25 + reachability * 0.25),
    daysToElection: days,
  }
}
