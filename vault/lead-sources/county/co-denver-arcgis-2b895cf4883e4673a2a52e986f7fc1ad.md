---
id: "co-denver-arcgis-2b895cf4883e4673a2a52e986f7fc1ad"
name: "BUSN_LIQUORLICENSES_P"
level: "county"
coverage: ["CO-Denver"]
triggers: ["new-license"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "arcgis"
tier: "A"
endpoint: "https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_BUSN_LIQUORLICENSES_P/FeatureServer/27"
request: {"method":"GET","where":"1=1","dateFilter":true,"outFields":"*","orderByFields":"MOST_RECENTLY_ISSUED_DATE DESC","pageSize":100}
fields: {"name":"BUS_PROF_NAME","line1":"FULL_ADDRESS","city":"CITY","state":"STATE","zip":"ZIP","triggeredAt":"MOST_RECENTLY_ISSUED_DATE","externalId":"OBJECTID","price":null}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.6},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"80202","city":"Denver","state":"CO","county":"Denver","countyFips":"08031","stateFips":"08","catalog":"ArcGIS Hub","discoveredAt":"2026-09-03T22:54:19.380Z"}
links: ["[[trigger/new-license]]","[[jurisdiction/CO-Denver]]","[[platform/arcgis]]"]
---

Discovered for ZIP 80202 through the ArcGIS Hub public catalog. Review the field map and run Proving Ground before use.
