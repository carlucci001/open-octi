---
id: "nc-sos-bulk"
name: "NC Secretary of State — Business Registration data subscription"
level: "state"
coverage: ["NC"]
triggers: ["new-business"]
verticals: ["all-b2b"]
platform: "rest-generic"
tier: "D"
endpoint: "https://www.sosnc.gov/online_services/data_subscriptions"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "weekly"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier D weekly CSV via FTP (subscription) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-business]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/all-b2b]]"]
---

THE new-business signal for NC but NOT free — the one paid exception worth pricing. Free fallback: web search (scrape-only) + Assumed Business Names.

Gotchas: entity name, addresses, officers/directors, status, filings, stock; no confirmed email

Compliance: Never make outreach look government-issued; disclose private-company status.

