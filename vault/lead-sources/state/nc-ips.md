---
id: "nc-ips"
name: "NC IPS / eProcurement bids"
level: "state"
coverage: ["NC"]
triggers: ["buying-signal"]
verticals: ["govcon"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.ips.state.nc.us/ncbids/logon.aspx"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "real-time"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C portal (login for detail) is outside the API-only WO-LS1 build"
links: ["[[trigger/buying-signal]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/govcon]]"]
---

Public-record lead source.

Gotchas: solicitation, agency

Compliance: Public.

