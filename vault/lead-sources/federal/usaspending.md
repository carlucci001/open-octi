---
id: "usaspending"
name: "USAspending.gov API"
level: "federal"
coverage: ["US"]
triggers: ["won-contract"]
verticals: ["govcon","professional-services","it-services"]
platform: "rest-generic"
tier: "A"
endpoint: "https://api.usaspending.gov/api/v2/search/spending_by_award/"
request: {"method":"POST","body":{"filters":{"time_period":[{"start_date":"{sinceDate}","end_date":"{today}"}],"recipient_locations":[{"country":"USA","zip":"{zip}"}],"award_type_codes":["A","B","C","D"]},"fields":["Award ID","Recipient Name","Start Date","Award Amount"],"page":1,"limit":"{limit}","subawards":false},"rowsPath":"results"}
fields: {"externalId":["Award ID","generated_unique_award_id"],"triggeredAt":["Start Date","period_of_performance_start_date"],"name":["Recipient Name","recipient_name"],"zip":["recipient_zip5","Place of Performance Zip5"]}
auth: {"type":"none"}
cadence: "daily"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0,"contactability":0},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/won-contract]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/govcon]]","[[vertical/professional-services]]","[[vertical/it-services]]"]
---

Join to SAM entity by UEI for firmographics. Filter first-time / small awardees.

Gotchas: recipient name, DBA, UEI, address, amount, NAICS, agency, dates, place of performance

Compliance: Public data.
