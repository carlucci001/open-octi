---
id: "platform-accela"
name: "Accela Citizen Access + GIS mirrors — platform adapter"
level: "platform"
coverage: ["multi"]
triggers: ["permit"]
verticals: ["home-services"]
platform: "arcgis"
tier: "C"
endpoint: "https://developer.accela.com"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C aca-prod.accela.com/<AGENCY>/ UI (scrape) or agency ArcGIS mirror (free) is outside the API-only WO-LS1 build"
links: ["[[trigger/permit]]","[[jurisdiction/multi]]","[[platform/arcgis]]","[[vertical/home-services]]"]
---

Free path = an agency-published GIS mirror when available.

Gotchas: record id/type, address, contractor, value

Compliance: Per-agency ToS.
