---
id: "co-denver-arcgis-7c53bd0894134e80ae1e478c0789bf49"
name: "PROP_PARCELS_A"
level: "county"
coverage: ["CO-Denver"]
triggers: ["new-homeowner"]
verticals: ["home-services","real-estate","insurance-agencies"]
platform: "arcgis"
tier: "A"
endpoint: "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_PROP_PARCELS_A/FeatureServer/245"
request: {"method":"GET","where":"1=1","outFields":"*","pageSize":100}
fields: {"name":"OWNER_NAME","line1":"OWNER_ADDRESS_LINE1","city":"OWNER_CITY","state":"OWNER_STATE","zip":"OWNER_ZIP","triggeredAt":"SALE_DATE","externalId":"OBJECTID","price":"SALE_PRICE"}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.95},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"80202","city":"Denver","state":"CO","county":"Denver","countyFips":"08031","stateFips":"08","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:38:22.431Z"}
links: ["[[trigger/new-homeowner]]","[[jurisdiction/CO-Denver]]","[[platform/arcgis]]"]
---

Discovered for ZIP 80202 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
