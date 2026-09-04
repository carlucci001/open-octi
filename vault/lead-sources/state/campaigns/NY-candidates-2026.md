---
id: "ny-candidates-2026"
name: "New York Active Campaign Candidate Filers"
level: "state"
coverage: ["NY"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "structured-download"
tier: "A"
endpoint: "https://data.ny.gov/resource/epr8-9fny.json?$where=filer_status%3D%27ACTIVE%27&$limit=50000"
request: {"format":"json","allowHtmlScrape":false,"allowPdf":false,"officialLandingPage":"https://data.ny.gov/Government-Finance/Campaign-Finance-Active-Candidates-Data-Beginning-/epr8-9fny","localRaces":true}
fields: {"externalId":"filer_id","name":"filer_name","office":"office_desc","district":"district","county":"county_desc","party":null,"email":null,"phone":null,"line1":"address","city":"city","state":"state","zip":"zipcode","filingDate":null}
auth: {"type":"none"}
cadence: "daily"
compliance: {"channels":["mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-04","tosVerdict":"official NYSBOE open-data API; no contact fields and no commercial-use restriction found in dataset metadata"}
proving: {"thresholds":{"freshness":0.8,"geoPrecision":0.95,"contactability":0},"status":"unproven"}
discovered: true
links: ["[[trigger/candidate-filed]]","[[jurisdiction/NY]]","[[vertical/political-campaigns]]"]
---

Official New York State Board of Elections Socrata view of active campaign candidate filers, updated daily. The API includes state and county filers, office, district, address, county, and municipality. It has no email/phone and is therefore mail-only unless another lawful contact source enriches it.
