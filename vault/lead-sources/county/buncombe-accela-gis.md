---
id: "buncombe-accela-gis"
name: "Buncombe County Accela GIS mirror (parcel owner table)"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["new-homeowner"]
verticals: ["home-services"]
platform: "arcgis"
tier: "A"
endpoint: "https://gis.buncombecounty.org/arcgis/rest/services/Accela/MapServer"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "county-current"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-homeowner]]","[[jurisdiction/NC-Buncombe]]","[[platform/arcgis]]","[[vertical/home-services]]"]
---

Phone often blank but present — join to parcels by PIN.

Gotchas: OwnerFullName, Phone, Phone2, MailAddress, MailCity/State/Zip; zoning

Compliance: Phone → TCPA cell/DNC gate.

