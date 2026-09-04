---
id: "fec-campaigns-2026"
name: "FEC 2026 Candidate Committees"
level: "federal"
coverage: ["US"]
triggers: ["campaign","candidate-filed","committee-registered","cash-on-hand","election-window"]
verticals: ["political-campaigns"]
platform: "fec"
tier: "A"
endpoint: "https://api.open.fec.gov/v1/candidates/search/"
request: {"cycle":2026,"offices":["H","S","P"],"national":true,"forbidden":["/schedules/schedule_a/","/schedules/schedule_b/"]}
fields: {"externalId":"committee_id","name":"committee_name","email":"email","phone":"treasurer_phone","website":"website","cashOnHand":"cash_on_hand_end_period","receipts":"receipts","lastReport":"last_report_date"}
auth: {"type":"key","env":"FEC_API_KEY","settingsLink":"/openocti?tab=models-keys"}
cadence: "FEC API; refresh daily in election window"
compliance: {"channels":["email-b2b","phone-manual","mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"committee-contact-only; CAN-SPAM footer and immediate unsubscribe required; no party-targeted copy; no AI voice without recorded consent","fecContributorData":"never"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.95,"contactability":0.8},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/campaign]]","[[trigger/cash-on-hand]]","[[jurisdiction/US]]","[[platform/fec]]","[[vertical/political-campaigns]]"]
---

National 2026 H/S/P candidate-committee source. The adapter uses candidate search, committee detail, and aggregate candidate totals only. It refuses every Schedule A/B contributor or vendor endpoint before a network request can be made.

Outreach compliance: contact committees, not contributors; include an accurate sender, physical postal address, and unsubscribe mechanism in commercial email; honor opt-out immediately. Manual business-line calls only between 8 a.m. and 9 p.m. local time. Autodialed, prerecorded, or AI-voice outreach requires recorded prior express consent. Party is display/filter metadata and must never drive outreach copy.
