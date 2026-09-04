---
id: "data-gov-ckan"
name: "Data.gov CKAN catalog (discovery)"
level: "platform"
coverage: ["US"]
triggers: ["discovery"]
verticals: ["all"]
platform: "rest-generic"
tier: "A"
endpoint: "https://catalog.data.gov/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "continuous"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/discovery]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/all]]"]
---

Meta-source for the discovery agent.

Gotchas: dataset metadata

Compliance: n/a

