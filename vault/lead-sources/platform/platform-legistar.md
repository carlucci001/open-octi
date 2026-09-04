---
id: "platform-legistar"
name: "Legistar Web API (Granicus) — agendas / rezoning"
level: "platform"
coverage: ["multi"]
triggers: ["pre-permit"]
verticals: ["commercial-construction"]
platform: "rest-generic"
tier: "A"
endpoint: "https://webapi.legistar.com/Home/Examples"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "live"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/pre-permit]]","[[jurisdiction/multi]]","[[platform/rest-generic]]","[[vertical/commercial-construction]]"]
---

Buncombe uses PublicInput, not Legistar.

Gotchas: matters, events, attachments

Compliance: Public.

