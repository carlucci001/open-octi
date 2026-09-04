---
id: "census-bfs-cbp"
name: "Census Business Formation Statistics / County Business Patterns / ACS"
level: "federal"
coverage: ["US"]
triggers: ["market-sizing"]
verticals: ["all"]
platform: "rest-generic"
tier: "A"
endpoint: "https://www.census.gov/data/developers/data-sets.html"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"key","settingsLink":"/openocti?tab=models-keys"}
cadence: "weekly / monthly / annual"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/market-sizing]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/all]]"]
---

Prioritization layer only — no entities.

Gotchas: aggregate counts by state/county/NAICS; ACS mover & tenure demographics

Compliance: Public.

