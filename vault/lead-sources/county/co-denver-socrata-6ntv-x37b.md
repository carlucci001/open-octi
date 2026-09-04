---
id: "co-denver-socrata-6ntv-x37b"
name: "Businesses Issued Outdoor Expansion Permits in Denver, Colorado"
level: "county"
coverage: ["CO-Denver"]
triggers: ["permit"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "socrata"
tier: "A"
endpoint: "https://data.colorado.gov/resource/6ntv-x37b.json"
request: {"method":"GET","where":"","order":""}
fields: {"name":"business_trade_name","line1":"address","city":null,"state":null,"zip":null,"triggeredAt":null,"externalId":"date_posted","price":null}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.6},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"80202","city":"Denver","state":"CO","county":"Denver","countyFips":"08031","stateFips":"08","catalog":"Socrata","discoveredAt":"2026-09-03T22:54:20.050Z"}
links: ["[[trigger/permit]]","[[jurisdiction/CO-Denver]]","[[platform/socrata]]"]
---

Discovered for ZIP 80202 through the Socrata public catalog. Review the field map and run Proving Ground before use.
