---
id: "buncombe-food-inspections"
name: "Buncombe County food-service inspections / new food establishments"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["new-restaurant"]
verticals: ["restaurants-hospitality"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.buncombenc.gov/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "?"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C unknown — no open dataset found (gap) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-restaurant]]","[[jurisdiction/NC-Buncombe]]","[[platform/rest-generic]]","[[vertical/restaurants-hospitality]]"]
---

Proving-ground task: locate the county inspection system (NC has no statewide feed).

Gotchas: establishment, address, permit date

Compliance: Public.

