---
id: "state-warn-pattern"
name: "State WARN notice pages (50-state pattern)"
level: "state"
coverage: ["multi"]
triggers: ["layoff"]
verticals: ["staffing"]
platform: "socrata"
tier: "C"
endpoint: "https://www.dol.gov/agencies/eta/layoffs/warn"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "as filed"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C PDF/HTML scrape; a few Socrata is outside the API-only WO-LS1 build"
links: ["[[trigger/layoff]]","[[jurisdiction/multi]]","[[platform/socrata]]","[[vertical/staffing]]"]
---

One parser per state.

Gotchas: company, site, dates, count

Compliance: Public.

