---
id: "ttb-cola"
name: "TTB COLA public registry / permits"
level: "federal"
coverage: ["US"]
triggers: ["new-license"]
verticals: ["craft-beverage","ecommerce"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.ttb.gov/regulated-commodities/labeling/cola-public-registry"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "daily"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web search UI (scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/craft-beverage]]","[[vertical/ecommerce]]"]
---

No official API.

Gotchas: brand, applicant name + address, product class, approval date

Compliance: Check ToS.

