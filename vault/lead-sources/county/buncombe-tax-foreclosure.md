---
id: "buncombe-tax-foreclosure"
name: "Buncombe County tax foreclosure sales"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["distress"]
verticals: ["real-estate"]
platform: "rest-generic"
tier: "C"
endpoint: "https://taxforeclosures.buncombenc.gov/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "as scheduled"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C portal + PDF (scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/distress]]","[[jurisdiction/NC-Buncombe]]","[[platform/rest-generic]]","[[vertical/real-estate]]"]
---

Public-record lead source.

Gotchas: owner, parcel, sale date

Compliance: FCRA trip-wire if used for screening.

