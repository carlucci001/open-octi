---
id: "City, ST-permits"
name: "City of City, ST — City, STPermits MapServer (2000–present)"
level: "city"
coverage: ["NC-City, ST"]
triggers: ["permit"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "arcgis"
tier: "A"
endpoint: "http://arcgis.City, STnc.gov/arcgis/rest/services/Permits/City, STPermits/MapServer/0"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/permit]]","[[jurisdiction/NC-City, ST]]","[[platform/arcgis]]","[[vertical/home-services]]","[[vertical/remodeling-specialty-trades]]","[[vertical/restaurants-hospitality]]"]
---

Plain-HTTP endpoint; smoke-test reachability. Commercial upfit permits = new business at that address.

Gotchas: record id/type, address, contractor, job value, status, dates (Accela naming)

Compliance: Public.

