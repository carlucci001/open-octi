---
id: "nc-sos-abn"
name: "NC SOS Assumed Business Names (DBA) search"
level: "state"
coverage: ["NC"]
triggers: ["new-business"]
verticals: ["all-b2b","home-services"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.sosnc.gov/online_services/assumed_name/search"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "real-time"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C web search UI (scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-business]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/all-b2b]]","[[vertical/home-services]]"]
---

Cleanest free new-small-business signal in NC; ToS check before automating.

Gotchas: assumed name, owner, county, filing date

Compliance: Same solicitation-disclosure rule.

