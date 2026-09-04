---
id: "nc-candidates-2026"
name: "NCSBE 2026 Candidate List"
level: "state"
coverage: ["NC"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "structured-download"
tier: "A"
endpoint: "https://s3.amazonaws.com/dl.ncsbe.gov/Elections/2026/Candidate%20Filing/Candidate_Listing_2026.csv"
request: {"method":"GET","format":"csv","officialLandingPage":"https://www.ncsbe.gov/results-data/candidate-lists","hashForChangeDetection":true,"localRaces":true}
fields: {"externalId":["Candidate ID","candidate_id","Candidate Name"],"triggeredAt":["Filing Date","filing_date"],"name":["Candidate Name","candidate_name"],"firstName":["First Name","first_name"],"lastName":["Last Name","last_name"],"email":["Email","email"],"phone":["Phone","Phone Number","phone"],"line1":["Address","Street Address","address"],"city":["City","city"],"state":["State","state"],"zip":["Zip","Zip Code","zip"],"county":["County","county"],"office":["Contest Name","Office","contest"],"district":["District","district"],"party":["Party","party"],"filingDate":["Filing Date","filing_date"]}
auth: {"type":"none"}
cadence: "daily during filing periods; hash each official CSV"
compliance: {"channels":["email-b2b","phone-manual","mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"official public candidate list; no stated commercial-use restriction; CAN-SPAM and consent gates apply"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.95,"contactability":0.8},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/candidate-filed]]","[[jurisdiction/NC]]","[[platform/structured-download]]","[[vertical/political-campaigns]]"]
---

Official NCSBE CSV with candidate email, phone, address, contest, county, party, and filing date. It includes federal, state, county, municipal, and school-board races aggregated by the state. The adapter hashes the single file and refuses HTML or PDF responses.

Outreach is party-neutral. Candidate/committee business email uses a CAN-SPAM footer and immediate opt-out. Calls are manual business calls only; prerecorded, autodialed, or AI-voice outreach requires recorded prior express consent.
