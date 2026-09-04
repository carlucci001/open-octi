---
id: "City, ST-homestay"
name: "City of City, ST — Homestay (STR) permits layer"
level: "city"
coverage: ["NC-City, ST"]
triggers: ["new-business"]
verticals: ["property-management","home-services"]
platform: "arcgis"
tier: "A"
endpoint: "https://gis.City, STnc.gov/server/rest/services/Permits/HomestayPermitsView/MapServer/5"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-business]]","[[jurisdiction/NC-City, ST]]","[[platform/arcgis]]","[[vertical/property-management]]","[[vertical/home-services]]"]
---

Verified schema.

Gotchas: record_id, address, business_name, license_number, apn, status, dates, job_value

Compliance: Public.

