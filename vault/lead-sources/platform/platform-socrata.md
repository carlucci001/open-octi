---
id: "platform-socrata"
name: "Socrata / SODA — platform adapter"
level: "platform"
coverage: ["multi"]
triggers: ["platform"]
verticals: ["all"]
platform: "socrata"
tier: "A"
endpoint: "https://dev.socrata.com/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "per dataset"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/platform]]","[[jurisdiction/multi]]","[[platform/socrata]]","[[vertical/all]]"]
---

Cleanest query language; NY/CO/WA/TX + Chicago, Seattle, Dallas, NYC, SF.

Gotchas: per dataset

Compliance: Per-dataset terms.

