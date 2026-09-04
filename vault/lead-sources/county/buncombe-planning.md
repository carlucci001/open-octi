---
id: "buncombe-planning"
name: "Buncombe County Planning Board agendas (PublicInput)"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["pre-permit"]
verticals: ["commercial-construction"]
platform: "rest-generic"
tier: "C"
endpoint: "https://engage.buncombecounty.org/buncombeplanningboard"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "monthly"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C PDF packets (scrape/parse) is outside the API-only WO-LS1 build"
links: ["[[trigger/pre-permit]]","[[jurisdiction/NC-Buncombe]]","[[platform/rest-generic]]","[[vertical/commercial-construction]]"]
---

Not Legistar — PDF parse.

Gotchas: applicant, parcel, project

Compliance: Public.

