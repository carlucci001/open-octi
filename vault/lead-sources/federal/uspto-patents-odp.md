---
id: "uspto-patents-odp"
name: "USPTO Open Data Portal — Patent File Wrapper"
level: "federal"
coverage: ["US"]
triggers: ["new-brand"]
verticals: ["startups","manufacturing"]
platform: "rest-generic"
tier: "A"
endpoint: "https://data.uspto.gov/apis/getting-started"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"key","settingsLink":"/openocti?tab=models-keys"}
cadence: "weekly"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-brand]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/startups]]","[[vertical/manufacturing]]"]
---

ODP replaced legacy PatentsView keys.

Gotchas: applicant/assignee name + address, inventors, filing date, CPC

Compliance: Public filings.

