---
id: "atf-ffl"
name: "ATF Federal Firearms Licensee list"
level: "federal"
coverage: ["US"]
triggers: ["new-license"]
verticals: ["retail","pos"]
platform: "rest-generic"
tier: "B"
endpoint: "https://www.atf.gov/firearms/listing-federal-firearms-licensees-ffls-2015"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "quarterly"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B quarterly bulk CSV per state is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/retail]]","[[vertical/pos]]"]
---

Diff quarters yourself.

Gotchas: license name, trade name, address, license type, expiration

Compliance: Public.

