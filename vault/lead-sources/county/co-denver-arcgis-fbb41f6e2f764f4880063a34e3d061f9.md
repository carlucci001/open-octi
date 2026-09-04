---
id: "co-denver-arcgis-fbb41f6e2f764f4880063a34e3d061f9"
name: "DEV_DEMOLITIONPERMIT_P"
level: "county"
coverage: ["CO-Denver"]
triggers: ["permit"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "arcgis"
tier: "A"
endpoint: "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_DEV_DEMOLITIONPERMIT_P/FeatureServer/318"
request: {"method":"GET","where":"1=1","dateFilter":true,"outFields":"*","orderByFields":"DATE_ISSUED DESC","pageSize":100}
fields: {"name":"CONTRACTOR_NAME","line1":"ADDRESS","city":null,"state":null,"zip":null,"triggeredAt":"DATE_ISSUED","externalId":"OBJECTID","price":"VALUATION"}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.6},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"80202","city":"Denver","state":"CO","county":"Denver","countyFips":"08031","stateFips":"08","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:54:19.239Z"}
links: ["[[trigger/permit]]","[[jurisdiction/CO-Denver]]","[[platform/arcgis]]"]
---

Discovered for ZIP 80202 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
