---
id: "sam-entity"
name: "SAM.gov Entity Management API"
level: "federal"
coverage: ["US"]
triggers: ["new-business"]
verticals: ["govcon","it-services"]
platform: "rest-generic"
tier: "A"
endpoint: "https://api.sam.gov/entity-information/v3/entities"
request: {"method":"GET","query":{"physicalAddressZIP":"{zip}","registrationStatus":"A","api_key":"{apiKey}"},"rowsPath":"entityData"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"key","env":"SAM_API_KEY","query":"api_key","settingsLink":"/openocti?tab=models-keys"}
cadence: "near real-time"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-business]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/govcon]]","[[vertical/it-services]]"]
---

Firmographic enrichment layer for USAspending hits.

Gotchas: legal/DBA name, UEI/CAGE, address, NAICS, business-type flags, dates

Compliance: ToU forbids marketing use of D&B-sourced fields and bot harvesting; never outreach from SAM POC data.

