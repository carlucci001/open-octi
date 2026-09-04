---
id: "nc-ncrec"
name: "NC Real Estate Commission licensees"
level: "state"
coverage: ["NC"]
triggers: ["new-license"]
verticals: ["real-estate"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.ncrec.gov/Licensing/Licensees"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web search + monthly stats is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/real-estate]]"]
---

Public-record lead source.

Gotchas: licensee, firm, address, status

Compliance: Check ToS.

