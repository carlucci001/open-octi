---
id: "federal-register"
name: "Federal Register API"
level: "federal"
coverage: ["US"]
triggers: ["timing"]
verticals: ["all"]
platform: "rest-generic"
tier: "A"
endpoint: "https://www.federalregister.gov/api/v1/documents.json"
request: {"method":"GET","query":{"per_page":"{limit}","conditions[publication_date][gte]":"{sinceDate}","order":"newest"},"rowsPath":"results"}
fields: {"externalId":"document_number","triggeredAt":"publication_date","name":"title","website":"html_url"}
auth: {"type":"none"}
cadence: "daily"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0,"contactability":0},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/timing]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/all]]"]
---

Not an entity list — a 'reason to reach out now' engine layered on other triggers.

Gotchas: rule title, agency, dates, CFR, full text

Compliance: Public.

