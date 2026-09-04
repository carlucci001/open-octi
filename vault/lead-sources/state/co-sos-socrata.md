---
id: "co-sos-socrata"
name: "Colorado Business Entities (Socrata)"
level: "state"
coverage: ["CO"]
triggers: ["new-business"]
verticals: ["all-b2b"]
platform: "socrata"
tier: "A"
endpoint: "https://data.colorado.gov/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-business]]","[[jurisdiction/CO]]","[[platform/socrata]]","[[vertical/all-b2b]]"]
---

Public-record lead source.

Gotchas: entity, status, formation date, addresses, agent

Compliance: CO SB23-037: solicitations must disclose private sender + where to get the record free.

