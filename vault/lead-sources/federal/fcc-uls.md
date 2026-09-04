---
id: "fcc-uls"
name: "FCC License View API / ULS bulk"
level: "federal"
coverage: ["US"]
triggers: ["new-license"]
verticals: ["media","telecom"]
platform: "rest-generic"
tier: "A"
endpoint: "https://www.fcc.gov/reports-research/developers/license-view-api"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "weekly bulk"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-license]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/media]]","[[vertical/telecom]]"]
---

Diff weekly bulk files to find new grants.

Gotchas: licensee name, address, service, grant date, call sign; contact email in some records

Compliance: Public.

