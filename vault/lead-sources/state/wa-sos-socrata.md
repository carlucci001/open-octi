---
id: "wa-sos-socrata"
name: "Washington Corporations Search (Socrata)"
level: "state"
coverage: ["WA"]
triggers: ["new-business"]
verticals: ["all-b2b"]
platform: "socrata"
tier: "A"
endpoint: "https://data.wa.gov/Consumer-Protection/Corporations-Search-Washington-state-/f9jk-mm39"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-business]]","[[jurisdiction/WA]]","[[platform/socrata]]","[[vertical/all-b2b]]"]
---

Public-record lead source.

Gotchas: entity, status, dates, addresses

Compliance: WA enforces against deceptive SOS-lookalike mailers.

