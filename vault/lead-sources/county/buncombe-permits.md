---
id: "buncombe-permits"
name: "Buncombe County permits (Accela Citizen Access + permits MapServer)"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["permit"]
verticals: ["home-services","remodeling-specialty-trades"]
platform: "arcgis"
tier: "C"
endpoint: "https://onlinepermits.buncombecounty.org"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C Accela Citizen Access UI (scrape) + GIS MapServer (schema TBD) is outside the API-only WO-LS1 build"
links: ["[[trigger/permit]]","[[jurisdiction/NC-Buncombe]]","[[platform/arcgis]]","[[vertical/home-services]]","[[vertical/remodeling-specialty-trades]]"]
---

Prove the GIS mirror first; Accela Construct API is paid/partner-only.

Gotchas: record id/type, address, contractor, value, status, dates

Compliance: Public.

