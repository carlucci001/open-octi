---
id: "fdic-bankfind"
name: "FDIC BankFind Suite API"
level: "federal"
coverage: ["US"]
triggers: ["new-business"]
verticals: ["fintech","compliance"]
platform: "rest-generic"
tier: "A"
endpoint: "https://banks.data.fdic.gov/api/institutions"
request: {"method":"GET","query":{"filters":"ZIP:{zip}","fields":"CERT,NAME,ADDRESS,CITY,STALP,ZIP,COUNTY,ESTYMD","limit":"{limit}","format":"json"},"rowsPath":"data"}
fields: {"externalId":"data.CERT","triggeredAt":"data.ESTYMD","name":"data.NAME","line1":"data.ADDRESS","city":"data.CITY","state":"data.STALP","zip":"data.ZIP","county":"data.COUNTY"}
auth: {"type":"none"}
cadence: "regular"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.8,"contactability":0},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-business]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/fintech]]","[[vertical/compliance]]"]
---

Rare but high-ticket.

Gotchas: name, address, established date, assets, branches

Compliance: Public.
