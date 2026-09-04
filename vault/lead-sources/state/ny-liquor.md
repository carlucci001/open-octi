---
id: "ny-liquor"
name: "New York Liquor Authority active licenses (Socrata)"
level: "state"
coverage: ["NY"]
triggers: ["new-restaurant"]
verticals: ["restaurants-hospitality"]
platform: "socrata"
tier: "A"
endpoint: "https://data.ny.gov/Economic-Development/Current-Liquor-Authority-Active-Licenses/9s3h-dpkz"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-restaurant]]","[[jurisdiction/NY]]","[[platform/socrata]]","[[vertical/restaurants-hospitality]]"]
---

Reference for the ABC-license pattern.

Gotchas: premises name, address, license type, dates

Compliance: Public.

