---
id: "nih-reporter"
name: "NIH RePORTER API"
level: "federal"
coverage: ["US"]
triggers: ["won-contract"]
verticals: ["biotech","research"]
platform: "rest-generic"
tier: "A"
endpoint: "https://api.reporter.nih.gov/v2/projects/search"
request: {"method":"POST","body":{"criteria":{"org_zip_codes":["{zip}"],"project_start_date":{"from_date":"{sinceDate}","to_date":"{today}"}},"offset":0,"limit":"{limit}"},"rowsPath":"results"}
fields: {"externalId":"project_num","triggeredAt":"project_start_date","name":"organization.org_name","line1":"organization.org_address","city":"organization.org_city","state":"organization.org_state","zip":"organization.org_zipcode"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/won-contract]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/biotech]]","[[vertical/research]]"]
---

Filter activity codes R41–R44 for SBIR/STTR.

Gotchas: PI, org name + address, amount, dates

Compliance: Public.
