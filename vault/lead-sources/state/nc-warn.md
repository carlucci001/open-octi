---
id: "nc-warn"
name: "NC Commerce WARN notices"
level: "state"
coverage: ["NC"]
triggers: ["layoff"]
verticals: ["staffing"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.commerce.nc.gov/data-tools-reports/labor-market-data-tools/workforce-warn-reports"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "as filed"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C PDF/HTML + dashboard (scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/layoff]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/staffing]]"]
---

Win-back / staffing angle, not acquisition.

Gotchas: company, location, dates, count

Compliance: Public.

