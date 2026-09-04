---
id: "City, ST-inspections"
name: "City of City, ST — permit inspections (ArcGIS Online)"
level: "city"
coverage: ["NC-City, ST"]
triggers: ["permit"]
verticals: ["home-services"]
platform: "arcgis"
tier: "A"
endpoint: "https://services.arcgis.com/zTM0LZtJeE1HzO09/arcgis/rest/services/City_of_City, ST_Permit_Inspections/FeatureServer"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/permit]]","[[jurisdiction/NC-City, ST]]","[[platform/arcgis]]","[[vertical/home-services]]"]
---

Public-record lead source.

Gotchas: query a record for schema

Compliance: Public.

