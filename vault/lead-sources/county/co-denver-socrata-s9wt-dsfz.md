---
id: "co-denver-socrata-s9wt-dsfz"
name: "Active Business Licenses Denver"
level: "county"
coverage: ["CO-Denver"]
triggers: ["new-license"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "socrata"
tier: "A"
endpoint: "https://data.colorado.gov/resource/s9wt-dsfz.json"
request: {"method":"GET","where":"","order":""}
fields: {"name":"entity_name","line1":null,"city":null,"state":null,"zip":null,"triggeredAt":null,"externalId":"entity_name","price":null}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.6},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"80202","city":"Denver","state":"CO","county":"Denver","countyFips":"08031","stateFips":"08","catalog":"Socrata","discoveredAt":"2026-09-03T22:54:20.050Z"}
links: ["[[trigger/new-license]]","[[jurisdiction/CO-Denver]]","[[platform/socrata]]"]
---

Discovered for ZIP 80202 through the Socrata public catalog. Review the field map and run Proving Ground before use.
