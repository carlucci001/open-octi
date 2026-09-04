---
id: "sec-edgar-formd"
name: "SEC EDGAR Full-Text Search + Form D"
level: "federal"
coverage: ["US"]
triggers: ["funded"]
verticals: ["startups","professional-services"]
platform: "rest-generic"
tier: "A"
endpoint: "https://efts.sec.gov/LATEST/search-index"
request: {"method":"GET","headers":{"User-Agent":"OpenOcti lead-signals contact@example.invalid"},"query":{"forms":"D","startdt":"{sinceDate}","from":"{offset}","size":"{limit}"},"rowsPath":"hits.hits"}
fields: {"externalId":"_id","triggeredAt":"_source.file_date","name":"_source.display_names.0","state":"_source.biz_states.0"}
auth: {"type":"none"}
cadence: "same-day"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0,"contactability":0},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/funded]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/startups]]","[[vertical/professional-services]]"]
---

Form D = private raise; S-1 = IPO. Second call to submissions API for entity details.

Gotchas: issuer name, address, offering amount, related persons (officers)

Compliance: Public filings.

