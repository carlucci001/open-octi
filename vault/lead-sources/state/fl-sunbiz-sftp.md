---
id: "fl-sunbiz-sftp"
name: "Florida Sunbiz daily data files (SFTP)"
level: "state"
coverage: ["FL"]
triggers: ["new-business"]
verticals: ["all-b2b"]
platform: "rest-generic"
tier: "B"
endpoint: "https://dos.fl.gov/sunbiz/other-services/data-downloads/daily-data/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "daily"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B public SFTP daily text files is outside the API-only WO-LS1 build"
links: ["[[trigger/new-business]]","[[jurisdiction/FL]]","[[platform/rest-generic]]","[[vertical/all-b2b]]"]
---

Best-in-class flat-file pattern; confirm email field.

Gotchas: entity, addresses, officers/registered agent; FL treats filing emails as public record (field layout to confirm)

Compliance: Solicitation-disclosure rule.

