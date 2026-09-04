---
id: "nc-buncombe-arcgis-d8393fa255f74623abd52a653d824f29"
name: "Buncombe_County_Parcels"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["new-homeowner"]
verticals: ["home-services","real-estate","insurance-agencies"]
platform: "arcgis"
tier: "A"
endpoint: "https://services1.arcgis.com/PwLrOgCfU0cYShcG/arcgis/rest/services/Buncombe_County_Parcels/FeatureServer/0"
request: {"method":"GET","where":"1=1","dateFilter":true,"outFields":"*","orderByFields":"DeedDate DESC","pageSize":100}
fields: {"name":"owner","line1":"Address","city":"CityName","state":"State","zip":"Zipcode","triggeredAt":"DeedDate","externalId":"objectid","price":"SalePrice"}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.8,"mailAddress":0.95},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"28801","city":"City, ST","state":"NC","county":"Buncombe","countyFips":"37021","stateFips":"37","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:37:48.834Z"}
links: ["[[trigger/new-homeowner]]","[[jurisdiction/NC-Buncombe]]","[[platform/arcgis]]"]
---

Discovered for ZIP 28801 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
