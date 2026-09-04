---
id: "platform-arcgis"
name: "ArcGIS REST / ArcGIS Hub (Esri) — platform adapter"
level: "platform"
coverage: ["multi"]
triggers: ["platform"]
verticals: ["all"]
platform: "arcgis"
tier: "A"
endpoint: "https://hub.arcgis.com/api/search/v1/collections/dataset/items"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/platform]]","[[jurisdiction/multi]]","[[platform/arcgis]]","[[vertical/all]]"]
---

Widest US local-gov coverage; build FIRST. Accela field names (record_id, record_type, job_value) fingerprint permit mirrors.

Gotchas: self-describing (?f=json)

Compliance: Per-instance ToS.

