---
id: "nc-ecourts-rpa"
name: "NC eCourts Remote Public Access (bulk extracts)"
level: "state"
coverage: ["NC"]
triggers: ["distress"]
verticals: ["legal","real-estate"]
platform: "rest-generic"
tier: "D"
endpoint: "https://www.nccourts.gov/services/remote-public-access-program"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "real-time"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier D online queries + bulk extracts (license) is outside the API-only WO-LS1 build"
links: ["[[trigger/distress]]","[[jurisdiction/NC]]","[[platform/rest-generic]]","[[vertical/legal]]","[[vertical/real-estate]]"]
---

Highest unverified upside; email redacted@example.invalid for terms before building.

Gotchas: case parties, type, filing date

Compliance: Commercial-use terms unknown; FCRA trip-wire if used for screening.

