---
id: "usda-organic"
name: "USDA Organic Integrity Database"
level: "federal"
coverage: ["US"]
triggers: ["new-license"]
verticals: ["agtech","ecommerce"]
platform: "rest-generic"
tier: "B"
endpoint: "https://organic.ams.usda.gov/integrity/About"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B search UI + downloadable dataset; lightly documented API is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/agtech]]","[[vertical/ecommerce]]"]
---

Confirm API endpoint before building.

Gotchas: operation name, address, certifier, effective date, scope

Compliance: Public.

