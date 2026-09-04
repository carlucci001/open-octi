---
id: "md-candidates-2026"
name: "Maryland 2026 General Candidate List"
level: "state"
coverage: ["MD"]
triggers: ["campaign","candidate-filed","election-window"]
verticals: ["political-campaigns"]
platform: "structured-download"
tier: "A"
endpoint: "https://elections.maryland.gov/elections/2026/general_candidates/2026_GG_statewide_candidatelist.csv"
request: {"method":"GET","format":"csv","officialLandingPage":"https://elections.maryland.gov/elections/2026/general_candidates/2026_GG_statewide_candidatelist.html","hashForChangeDetection":true,"localRaces":false}
fields: {"externalId":["Candidate ID","CandidateID","Candidate Name","Name"],"triggeredAt":["Filed","Filing Date"],"name":["Candidate Name","Name"],"firstName":["First Name","FirstName"],"lastName":["Last Name","LastName"],"email":["Email","Email Address"],"phone":["Phone","Phone Number"],"line1":["Address","Address 1"],"city":["City"],"state":["State"],"zip":["Zip","Zip Code"],"county":["Jurisdiction","County"],"office":["Office","Office Name"],"district":["District"],"party":["Party"],"filingDate":["Filed","Filing Date"],"organizationName":["Committee Name"]}
auth: {"type":"none"}
cadence: "daily during filing and ballot-certification periods; hash each official CSV"
compliance: {"channels":["email-b2b","phone-manual","mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-04","tosVerdict":"official public candidate export; CAN-SPAM and consent gates apply"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.95,"contactability":0.8},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/candidate-filed]]","[[jurisdiction/MD]]","[[platform/structured-download]]","[[vertical/political-campaigns]]"]
---

Official Maryland State Board of Elections CSV. The board publishes a direct statewide export alongside its 2026 general candidate list, including campaign contact fields. The adapter hashes the file and refuses HTML or PDF responses.
