---
id: "nc-buncombe-arcgis-d30a9246ff9a4221af1c4cbe80351074"
name: "nc_buncombe"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["permit"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "arcgis"
tier: "A"
endpoint: "https://services7.arcgis.com/KzeiCaQsMoeCfoCq/arcgis/rest/services/buncombe_county_parcels/FeatureServer/0"
request: {"method":"GET","where":"1=1","dateFilter":true,"outFields":"*","orderByFields":"saledate DESC","pageSize":100}
fields: {"name":"owner","line1":"mailadd","city":"mail_city","state":null,"zip":"mail_zip","triggeredAt":"saledate","externalId":"tax_id","price":"parval"}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.6},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"28801","city":"City, ST","state":"NC","county":"Buncombe","countyFips":"37021","stateFips":"37","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:54:13.503Z"}
links: ["[[trigger/permit]]","[[jurisdiction/NC-Buncombe]]","[[platform/arcgis]]"]
---

Discovered for ZIP 28801 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
