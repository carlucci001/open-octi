---
id: "wa-sos-socrata"
name: "Washington Corporations Search (Socrata)"
level: "state"
coverage: ["WA"]
triggers: ["new-business"]
verticals: ["new-businesses","all-b2b"]
platform: "socrata"
tier: "A"
endpoint: "https://data.wa.gov/resource/f9jk-mm39.json"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":[],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-12","tosVerdict":"public-open-data"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"rejected"}
discovered: false
excludedReason: null
links: ["https://data.wa.gov/d/f9jk-mm39","https://data.wa.gov/api/views/f9jk-mm39.json"]
---

Public-record lead source.

2026-09-12 metadata check: this catalog entry has no columns and was last updated in 2015. No current field map can be verified; retain candidate status and record the failed API scorecard.

Gotchas: entity, status, dates, addresses

Compliance: WA enforces against deceptive SOS-lookalike mailers.

