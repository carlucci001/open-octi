---
id: "dol-form5500"
name: "DOL EBSA Form 5500 datasets"
level: "federal"
coverage: ["US"]
triggers: ["hiring"]
verticals: ["hr-tech","it-services"]
platform: "rest-generic"
tier: "B"
endpoint: "https://www.dol.gov/agencies/ebsa/researchers/data"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "annual + quarterly increments (7-month lag)"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B bulk CSV/ZIP is outside the API-only WO-LS1 build"
links: ["[[trigger/hiring]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/hr-tech]]","[[vertical/it-services]]"]
---

Firmographic filter (stable SMB with payroll).

Gotchas: sponsor name, EIN, address, plan type, participant count, administrator

Compliance: Public.

