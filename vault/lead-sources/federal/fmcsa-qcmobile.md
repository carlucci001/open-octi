---
id: "fmcsa-qcmobile"
name: "FMCSA QCMobile / SAFER (new motor carriers)"
level: "federal"
coverage: ["US"]
triggers: ["new-business"]
verticals: ["logistics","auto-services","bookkeeping"]
platform: "rest-generic"
tier: "A"
endpoint: "https://mobile.fmcsa.dot.gov/qc/services/carriers"
request: {"method":"GET","query":{"legalName":"{query}","webKey":"{apiKey}"},"rowsPath":"content"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"key","env":"FMCSA_WEB_KEY","query":"webKey","settingsLink":"/openocti?tab=models-keys"}
cadence: "weekly census"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-business]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/logistics]]","[[vertical/auto-services]]","[[vertical/bookkeeping]]"]
---

Discover new MC numbers from census/new-entrant files, then enrich per record via API.

Gotchas: legal/DBA name, address, PHONE, DOT#, MC#, fleet size, authority date

Compliance: Not DMV data; no DPPA overlay.

