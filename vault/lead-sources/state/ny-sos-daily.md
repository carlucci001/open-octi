---
id: "ny-sos-daily"
name: "New York — Daily Corporation & Entity Filings (Socrata)"
level: "state"
coverage: ["NY"]
triggers: ["new-business"]
verticals: ["all-b2b"]
platform: "socrata"
tier: "A"
endpoint: "https://data.ny.gov/Economic-Development/Corporations-and-Other-Entities-All-Filings/63wc-4exh"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "daily (rolling 30 days)"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-business]]","[[jurisdiction/NY]]","[[platform/socrata]]","[[vertical/all-b2b]]"]
---

Reference implementation of the Socrata SOS pattern.

Gotchas: entity name, type, filing date, county, address tables

Compliance: Solicitation-disclosure rule.

