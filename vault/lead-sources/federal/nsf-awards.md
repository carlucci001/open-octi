---
id: "nsf-awards"
name: "NSF Award Search API"
level: "federal"
coverage: ["US"]
triggers: ["won-contract"]
verticals: ["deep-tech","research"]
platform: "rest-generic"
tier: "A"
endpoint: "https://www.research.gov/common/webapi/awardapisearch-v1.htm"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/won-contract]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/deep-tech]]","[[vertical/research]]"]
---

Public-record lead source.

Gotchas: PI, institution, amount, dates

Compliance: Public.

