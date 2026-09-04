---
id: "tx-travis-arcgis-ba4dabe7b8e0477992a6e0d66d4232e5"
name: "Travis_County_parcels"
level: "county"
coverage: ["TX-Travis"]
triggers: ["new-homeowner"]
verticals: ["home-services","real-estate","insurance-agencies"]
platform: "arcgis"
tier: "A"
endpoint: "https://services1.arcgis.com/BSnEnFfEn54YLVeq/arcgis/rest/services/Travis_County_parcels/FeatureServer/0"
request: {"method":"GET","where":"1=1","dateFilter":true,"outFields":"*","orderByFields":"","pageSize":100}
fields: {"name":"OBJECTID","line1":null,"city":null,"state":null,"zip":null,"triggeredAt":null,"externalId":"OBJECTID","price":null}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.95},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"78701","city":"Austin","state":"TX","county":"Travis","countyFips":"48453","stateFips":"48","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:54:16.812Z"}
links: ["[[trigger/new-homeowner]]","[[jurisdiction/TX-Travis]]","[[platform/arcgis]]"]
---

Discovered for ZIP 78701 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
