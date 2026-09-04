---
id: "sba-dsbs"
name: "SBA Dynamic Small Business Search"
level: "federal"
coverage: ["US"]
triggers: ["new-business"]
verticals: ["govcon","it-services"]
platform: "rest-generic"
tier: "C"
endpoint: "https://dsbs.sba.gov/search/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "as updated"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web search UI (scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-business]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/govcon]]","[[vertical/it-services]]"]
---

No documented API; ToS review before automation.

Gotchas: company, address, phone, POC name, sometimes email, NAICS, certifications

Compliance: Check ToS.

