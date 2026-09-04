---
id: "opencorporates"
name: "OpenCorporates (aggregator)"
level: "platform"
coverage: ["multi"]
triggers: ["new-business"]
verticals: ["all-b2b"]
platform: "rest-generic"
tier: "D"
endpoint: "https://opencorporates.com"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "varies"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier D REST is outside the API-only WO-LS1 build"
links: ["[[trigger/new-business]]","[[jurisdiction/multi]]","[[platform/rest-generic]]","[[vertical/all-b2b]]"]
---

Not free for commercial use — excluded from the free registry; optional paid layer.

Gotchas: entity, officers, addresses

Compliance: License terms.

