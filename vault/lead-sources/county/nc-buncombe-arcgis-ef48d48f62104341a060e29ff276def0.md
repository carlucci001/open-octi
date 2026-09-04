---
id: "nc-buncombe-arcgis-ef48d48f62104341a060e29ff276def0"
name: "Bunc"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["permit"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "arcgis"
tier: "A"
endpoint: "https://services1.arcgis.com/PwLrOgCfU0cYShcG/arcgis/rest/services/Bunc/FeatureServer/0"
request: {"method":"GET","where":"1=1","outFields":"*","pageSize":100}
fields: {"name":"OWNER","line1":"STREETNAME","city":"CITY","state":"STATE","zip":"ZIPCODE","triggeredAt":"DEEDDATE","externalId":"PINNUM","price":"SALEPRICE"}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"28801","city":"City, ST","state":"NC","county":"Buncombe","countyFips":"37021","stateFips":"37","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:37:47.499Z"}
links: ["[[trigger/permit]]","[[jurisdiction/NC-Buncombe]]","[[platform/arcgis]]"]
---

Discovered for ZIP 28801 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
