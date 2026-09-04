---
id: "tx-tdlr"
name: "Texas TDLR all licenses (daily CSV)"
level: "state"
coverage: ["TX"]
triggers: ["new-license"]
verticals: ["home-services","auto-services","med-spas-dental"]
platform: "socrata"
tier: "B"
endpoint: "https://www.tdlr.texas.gov/licensesearch/licfile.asp"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "daily"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B daily CSV bulk (+ Socrata mirror) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/TX]]","[[platform/socrata]]","[[vertical/home-services]]","[[vertical/auto-services]]","[[vertical/med-spas-dental]]"]
---

Reference implementation of the bulk-license pattern. TX SOS entity data is paid.

Gotchas: licensee, business, address, phone, license type, issue date

Compliance: Public.

