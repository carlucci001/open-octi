---
id: "nc-abc-permits"
name: "NC ABC Commission permit search"
level: "state"
coverage: ["NC"]
triggers: ["new-restaurant"]
verticals: ["restaurants-hospitality"]
platform: "rest-generic"
tier: "C"
endpoint: "https://abc2.nc.gov/Search/Permit"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "real-time"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web search UI (scrape / daily diff) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-restaurant]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/restaurants-hospitality]]"]
---

No bulk/API; daily diff-scrape candidate.

Gotchas: permittee, trade name, address, permit type, issue date

Compliance: Check ToS.

