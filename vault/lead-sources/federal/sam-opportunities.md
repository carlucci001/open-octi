---
id: "sam-opportunities"
name: "SAM.gov Get Opportunities API"
level: "federal"
coverage: ["US"]
triggers: ["buying-signal"]
verticals: ["govcon"]
platform: "rest-generic"
tier: "A"
endpoint: "https://open.gsa.gov/api/get-opportunities-public-api/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"key","settingsLink":"/openocti?tab=models-keys"}
cadence: "real-time"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/buying-signal]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/govcon]]"]
---

Useful if the operator sells to government.

Gotchas: solicitation, NAICS, set-aside, dates, contracting-officer POC

Compliance: Public.

