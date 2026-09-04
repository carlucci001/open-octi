---
id: "nc-boards-other"
name: "NC boards: Cosmetic Arts, Nursing, Medical, Electrical/Plumbing/HVAC, DHHS facilities, Insurance agents, DMV dealers"
level: "state"
coverage: ["NC"]
triggers: ["new-license"]
verticals: ["med-spas-dental","specialty-clinics","home-services"]
platform: "rest-generic"
tier: "C"
endpoint: "https://www.nc.gov/agencies"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C per-board web lookup (unverified; assume scrape) is outside the API-only WO-LS1 build"
links: ["[[trigger/new-license]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/med-spas-dental]]","[[vertical/specialty-clinics]]","[[vertical/home-services]]"]
---

Needs per-board verification pass in the proving ground.

Gotchas: varies

Compliance: DMV-dealer data is NOT DPPA-restricted (business license), but never touch driver/vehicle records.

