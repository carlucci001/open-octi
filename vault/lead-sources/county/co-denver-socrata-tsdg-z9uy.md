---
id: "co-denver-socrata-tsdg-z9uy"
name: "Denver Parcels"
level: "county"
coverage: ["CO-Denver"]
triggers: ["new-homeowner"]
verticals: ["home-services","real-estate","insurance-agencies"]
platform: "socrata"
tier: "A"
endpoint: "https://data.colorado.gov/resource/tsdg-z9uy.json"
request: {"method":"GET","where":"situs_zip='80202'","order":"sale_date DESC"}
fields: {"name":"owner_name","line1":"situs_address_line1","city":"situs_city","state":"situs_state","zip":"situs_zip","triggeredAt":"sale_date","externalId":"globalid","price":"sale_price"}
auth: {"type":"none"}
cadence: "unknown"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"catalog-discovered-public-api"}
proving: {"thresholds":{"geoPrecision":0.8,"mailAddress":0.95},"status":"candidate"}
discovered: true
excludedReason: null
discovery: {"zip":"80202","city":"Denver","state":"CO","county":"Denver","countyFips":"08031","stateFips":"08","catalog":"Socrata","discoveredAt":"2026-09-03T22:54:20.050Z"}
links: ["[[trigger/new-homeowner]]","[[jurisdiction/CO-Denver]]","[[platform/socrata]]"]
---

Discovered for ZIP 80202 through the Socrata public catalog. Review the field map and run Proving Ground before use.
