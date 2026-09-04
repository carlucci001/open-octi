---
id: "buncombe-bids"
name: "Buncombe County / City of City, ST bid postings"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["buying-signal"]
verticals: ["govcon"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.buncombenc.gov/Bids.aspx"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "as posted"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C CivicEngage pages (scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/buying-signal]]","[[jurisdiction/NC-Buncombe]]","[[platform/rest-generic]]","[[vertical/govcon]]"]
---

Public-record lead source.

Gotchas: solicitation, due date

Compliance: Public.

