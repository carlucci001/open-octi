---
id: "state-ucc-pattern"
name: "State UCC filing search (50-state pattern)"
level: "state"
coverage: ["multi"]
triggers: ["growth"]
verticals: ["equipment","bookkeeping"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.nass.org/business-services/ucc-filings"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web search by debtor (no feeds) is outside the API-only WO-LS1 build"
links: ["[[trigger/growth]]","[[jurisdiction/multi]]","[[platform/rest-generic]]","[[vertical/equipment]]","[[vertical/bookkeeping]]"]
---

Enrichment check, not discovery.

Gotchas: debtor, secured party, date

Compliance: Public.

