---
id: "uspto-trademarks"
name: "USPTO Trademark filings (TSDR + bulk case files / ODP)"
level: "federal"
coverage: ["US"]
triggers: ["new-brand"]
verticals: ["branding","web-design","marketing"]
platform: "rest-generic"
tier: "A"
endpoint: "https://tsdrapi.uspto.gov/ts/cd/casedocs/bundle.json"
request: {"method":"GET","query":{"sn":"{serialNumber}"},"rowsPath":"caseFileHeader"}
fields: {"externalId":"serialNumber","triggeredAt":"filingDate","name":"markIdentification"}
auth: {"type":"key","env":"USPTO_ODP_API_KEY","settingsLink":"/openocti?tab=models-keys"}
cadence: "daily"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0,"contactability":0},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-brand]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/branding]]","[[vertical/web-design]]","[[vertical/marketing]]"]
---

Discover new serials via bulk/ODP search, enrich via TSDR.

Gotchas: owner name + address, mark, filing date, Nice class (industry)

Compliance: Public filings.
