---
id: "ca-dca"
name: "California DCA license data (open data + search API)"
level: "state"
coverage: ["CA"]
triggers: ["new-license"]
verticals: ["home-services","med-spas-dental"]
platform: "rest-generic"
tier: "B"
endpoint: "https://www.dca.ca.gov/data/index.shtml"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B open-data bulk + API (access request) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/CA]]","[[platform/rest-generic]]","[[vertical/home-services]]","[[vertical/med-spas-dental]]"]
---

Per-board use restrictions exist — check each board.

Gotchas: licensee, business, address, license type, dates

Compliance: Per-board ToS.

