---
id: "nc-ncdor-sales-tax"
name: "NCDOR Registry of Sales & Use Tax numbers"
level: "state"
coverage: ["NC"]
triggers: ["new-business"]
verticals: ["retail"]
platform: "rest-generic"
tier: "C"
endpoint: "https://eservices.dor.nc.gov/salesdatabase/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live (no new-registration timestamp)"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web search only is outside the API-only WO-LS1 build"
links: ["[[trigger/new-business]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/retail]]"]
---

Confirmation, not discovery.

Gotchas: business name, account ID

Compliance: Public.

