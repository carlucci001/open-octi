---
id: "dol-oflc"
name: "DOL OFLC LCA / PERM disclosure data"
level: "federal"
coverage: ["US"]
triggers: ["hiring"]
verticals: ["it-services","professional-services"]
platform: "rest-generic"
tier: "B"
endpoint: "https://www.dol.gov/agencies/eta/foreign-labor/performance"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "quarterly"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B quarterly bulk Excel/CSV is outside the API-only WO-LS1 build"
links: ["[[trigger/hiring]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/it-services]]","[[vertical/professional-services]]"]
---

Coarse cadence; good growth proxy.

Gotchas: employer name, address, NAICS, job title, wage, worksite

Compliance: Public.

