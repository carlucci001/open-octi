---
id: "va-candidates-2026"
name: "Virginia 2026 August Primary Candidate List"
level: "state"
coverage: ["VA"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "structured-download"
tier: "A"
endpoint: "https://www.elections.virginia.gov/media/castyourballot/candidatelist/2026/2026-August-Democratic-Primary-6-3-2026.xlsx"
request: {"format":"xlsx","allowHtmlScrape":false,"allowPdf":false,"officialLandingPage":"https://www.elections.virginia.gov/casting-a-ballot/candidate-list/","localRaces":true}
fields: {"name":"Candidate Name","office":"Office Title","district":"District","county":null,"party":"Political Party","email":"Campaign Email","phone":"Campaign Phone","line1":"Campaign Address Line 1","city":"Campaign City","state":"Campaign State","zip":"Campaign Zip","website":"Campaign Website","filingDate":null,"triggeredAt":"Election Date"}
auth: {"type":"none"}
cadence: "weekly during active election windows"
compliance: {"channels":["email","phone-manual","mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-04","tosVerdict":"official public XLSX candidate list; no commercial-use restriction found on source page"}
proving: {"thresholds":{"freshness":0.7,"geoPrecision":0.95,"contactability":0.8},"status":"unproven"}
discovered: true
links: ["[[trigger/candidate-filed]]","[[jurisdiction/VA]]","[[vertical/political-campaigns]]"]
---

Official Virginia Department of Elections XLSX. It contains federal and local August 2026 primary candidates with campaign email, phone, website, postal address, office, district, party, and election date. The exact workbook fetch is hashed; no HTML or PDF is parsed.
