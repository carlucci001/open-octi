---
id: "in-candidates-2026"
name: "Indiana 2026 General Election Candidate List"
level: "state"
coverage: ["IN"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "structured-download"
tier: "A"
endpoint: "https://www.in.gov/sos/elections/files/2026-General-Candidate-List-Updated-8.27.2026.xlsx"
request: {"format":"xlsx","headerRow":1,"allowHtmlScrape":false,"allowPdf":false,"officialLandingPage":"https://www.in.gov/sos/elections/candidate-information/","localRaces":true}
fields: {"name":"CANDIDATE NAME","office":"OFFICE","district":"DISTRICT","county":null,"party":"PARTY","email":null,"phone":null,"line1":null,"city":null,"state":null,"zip":null,"filingDate":"DATE FILED","triggeredAt":"DATE FILED"}
auth: {"type":"none"}
cadence: "weekly through election day"
compliance: {"channels":[],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-04","tosVerdict":"official public XLSX candidate list; no commercial-use restriction found on source page; file has no contact fields"}
proving: {"thresholds":{"freshness":0.7,"geoPrecision":0.95,"contactability":0},"status":"unproven"}
discovered: true
links: ["[[trigger/candidate-filed]]","[[jurisdiction/IN]]","[[vertical/political-campaigns]]"]
---

Official Indiana Election Division XLSX with statewide and local 2026 general-election candidates. The one-file fetch is hashed for change detection and contains office, name, party, district, and filing date; it does not contain candidate contact details.
