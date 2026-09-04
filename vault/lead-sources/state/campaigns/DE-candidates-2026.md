---
id: "de-candidates-2026"
name: "Delaware 2026 General Election Candidate List"
level: "state"
coverage: ["DE"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "structured-download"
tier: "A"
endpoint: "https://elections.delaware.gov/candidates/candidatelist/genl_fcddt_2026.xlsx"
request: {"format":"xlsx","allowHtmlScrape":false,"allowPdf":false,"officialLandingPage":"https://elections.delaware.gov/candidates/candidatelist/genl_fcddt_2026.html","localRaces":true}
fields: {"firstName":"First Name","lastName":"Last Name","office":"Office","district":null,"county":"County","party":"Party","email":"Email #1","phone":"Phone Number #1","line1":"Mailing Address Line1","city":null,"state":null,"zip":null,"website":"Website","filingDate":"Filing Date","triggeredAt":"Filing Date"}
auth: {"type":"none"}
cadence: "daily through election day"
compliance: {"channels":["email","phone-manual","mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-04","tosVerdict":"official public candidate XLSX; no commercial-use restriction found on the candidate-list page; voter-file restrictions do not apply to this candidate filing list"}
proving: {"thresholds":{"freshness":0.8,"geoPrecision":0.95,"contactability":0.8},"status":"unproven"}
discovered: true
links: ["[[trigger/candidate-filed]]","[[jurisdiction/DE]]","[[vertical/political-campaigns]]"]
---

Official Delaware Department of Elections XLSX for the 2026 general election. It includes candidate name, office, county, party, filing date, mailing/residential address, website, two email fields, and two phone fields. The fetch is one structured workbook request and is hashed for change detection; HTML scraping and PDF parsing remain prohibited.
