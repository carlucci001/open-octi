---
id: "co-denver-arcgis-4f00190e0d01411c81de9378fdfe2757"
name: "Denver_County_Parcels"
level: "county"
coverage: ["CO-Denver"]
triggers: ["new-homeowner"]
verticals: ["home-services","real-estate","insurance-agencies"]
platform: "arcgis"
tier: "A"
endpoint: "https://services1.arcgis.com/Ezk9fcjSUkeadg6u/arcgis/rest/services/Denver_County_Parcels/FeatureServer/0"
request: {"method":"GET","where":"1=1","outFields":"*","pageSize":100}
fields: {"name":"FID","line1":"SITUS_ADDR","city":"SITUS_CITY","state":null,"zip":"SITUS_ZIP","triggeredAt":null,"externalId":"FID","price":"SALE_PRICE"}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.95},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"80202","city":"Denver","state":"CO","county":"Denver","countyFips":"08031","stateFips":"08","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:38:23.331Z"}
links: ["[[trigger/new-homeowner]]","[[jurisdiction/CO-Denver]]","[[platform/arcgis]]"]
---

Discovered for ZIP 80202 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
