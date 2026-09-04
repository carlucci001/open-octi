---
id: "tn-candidates-2026"
name: "TN 2026 State Candidate Source Audit"
level: "state"
coverage: ["TN"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "rest-generic"
tier: "D"
endpoint: "https://sos.tn.gov/elections"
request: {"format":"no-api","allowHtmlScrape":false,"allowPdf":false,"officialLandingPage":"https://sos.tn.gov/elections","localRaces":false}
fields: {"name":null,"office":null,"district":null,"county":null,"party":null,"email":null,"phone":null,"address":null,"filingDate":null}
auth: {"type":"none"}
cadence: "recheck each filing period"
compliance: {"channels":[],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-04","tosVerdict":"not enabled; exact official CSV/XLSX/JSON/API URL and commercial-use terms must be verified before promotion"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.95,"contactability":0.8},"status":"excluded-from-build"}
discovered: false
excludedReason: "no-api: official structured candidate download not independently verified; HTML scraping and PDF parsing are forbidden"
links: ["[[trigger/candidate-filed]]","[[jurisdiction/TN]]","[[vertical/political-campaigns]]"]
---

State-board audit placeholder. The official election-board landing page is recorded, but this source remains excluded. Proving Ground may promote it only after an exact free API or official CSV/XLSX/JSON download and the board's commercial-use terms are verified. HTML scraping and PDF parsing are prohibited.
