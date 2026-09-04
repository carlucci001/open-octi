---
id: "me-candidates-2026"
name: "Maine 2026 General Election Candidate List"
level: "state"
coverage: ["ME"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "structured-download"
tier: "A"
endpoint: "https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/2026%20General%20Candidate%20List%20-%20posting.xlsx"
request: {"format":"xlsx","allowHtmlScrape":false,"allowPdf":false,"officialLandingPage":"https://www.maine.gov/sos/elections-voting/upcoming-elections","localRaces":false}
fields: {"firstName":"First Name","lastName":"Last Name","office":"Office","district":"Dist","county":"County","party":"Party","email":null,"phone":null,"line1":null,"city":"Residence Municipality","state":null,"filingDate":"Date Filed","triggeredAt":"Date Filed"}
auth: {"type":"none"}
cadence: "weekly through election day"
compliance: {"channels":["mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-04","tosVerdict":"official public XLSX candidate list; no commercial-use restriction found on the source page; no email or phone fields"}
proving: {"thresholds":{"freshness":0.7,"geoPrecision":0.95,"contactability":0},"status":"unproven"}
discovered: true
links: ["[[trigger/candidate-filed]]","[[jurisdiction/ME]]","[[vertical/political-campaigns]]"]
---

Official Maine Secretary of State XLSX with 2026 general-election candidates. It includes federal, state, and county offices, party, filing date, district/county, and residence municipality. It does not publish outreach email or phone fields. The fetch is one structured workbook request and is hashed for change detection; HTML scraping and PDF parsing remain prohibited.
