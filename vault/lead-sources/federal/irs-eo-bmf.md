---
id: "irs-eo-bmf"
name: "IRS Exempt Organizations BMF (+ 990 e-file)"
level: "federal"
coverage: ["US"]
triggers: ["new-nonprofit"]
verticals: ["nonprofits","donor-crm","web-design"]
platform: "rest-generic"
tier: "B"
endpoint: "https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "monthly"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B monthly bulk CSV; 990 XML bulk; ProPublica mirror API (unofficial) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-nonprofit]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/nonprofits]]","[[vertical/donor-crm]]","[[vertical/web-design]]"]
---

Bulk-only; diff monthly snapshots on ruling date.

Gotchas: name, EIN, address, NTEE code, ruling date; officers via 990

Compliance: Public data.

