---
id: "nc-nclbgc"
name: "NC Licensing Board for General Contractors"
level: "state"
coverage: ["NC"]
triggers: ["new-license"]
verticals: ["home-services","remodeling-specialty-trades"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.nclbgc.org/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web lookup (scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/home-services]]","[[vertical/remodeling-specialty-trades]]"]
---

No bulk/API.

Gotchas: licensee, qualifier, address, phone, license class, issue date

Compliance: Check ToS.

