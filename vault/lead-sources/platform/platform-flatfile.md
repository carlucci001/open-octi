---
id: "platform-flatfile"
name: "Bulk flat-file / SFTP diff — platform adapter"
level: "platform"
coverage: ["multi"]
triggers: ["platform"]
verticals: ["all"]
platform: "rest-generic"
tier: "B"
endpoint: "https://dos.fl.gov/sunbiz/other-services/data-downloads/daily-data/"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "per source"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier B HTTP/SFTP fetch → parse → diff vs last snapshot → emit new rows is outside the API-only WO-LS1 build"
links: ["[[trigger/platform]]","[[jurisdiction/multi]]","[[platform/rest-generic]]","[[vertical/all]]"]
---

One crawler shell, per-source field map.

Gotchas: per source mapping

Compliance: Per-source terms.

