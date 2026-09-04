---
id: "tx-travis-socrata-dgpb-zq6v"
name: "BOUNDARIES_wildland_urban_interface_code"
level: "county"
coverage: ["TX-Travis"]
triggers: ["permit"]
verticals: ["home-services","remodeling-specialty-trades","restaurants-hospitality"]
platform: "socrata"
tier: "A"
endpoint: "https://datahub.austintexas.gov/resource/dgpb-zq6v.json"
request: {"method":"GET","where":"","order":"created_date DESC"}
fields: {"name":"unique_id","line1":null,"city":null,"state":null,"zip":null,"triggeredAt":"created_date","externalId":"unique_id","price":null}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.6},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"78701","city":"Austin","state":"TX","county":"Travis","countyFips":"48453","stateFips":"48","catalog":"Socrata","discoveredAt":"2026-09-03T22:54:17.492Z"}
links: ["[[trigger/permit]]","[[jurisdiction/TX-Travis]]","[[platform/socrata]]"]
---

Discovered for ZIP 78701 through the Socrata public catalog. Review the field map and run Proving Ground before use.
