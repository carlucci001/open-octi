---
id: "platform-headless"
name: "Headless-browser scraper tier (ToS-gated)"
level: "platform"
coverage: ["multi"]
triggers: ["platform"]
verticals: ["all"]
platform: "rest-generic"
tier: "C"
endpoint: "https://playwright.dev"
request: {"method":"GET","query":{},"rowsPath":"results"}
fields: {"externalId":"id","triggeredAt":"date","name":"name"}
auth: {"type":"none"}
cadence: "daily diff"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{},"status":"excluded-from-build"}
discovered: false
excludedReason: "Tier C Playwright diff-scrape with per-source ToS/robots check recorded in manifest is outside the API-only WO-LS1 build"
links: ["[[trigger/platform]]","[[jurisdiction/multi]]","[[platform/rest-generic]]","[[vertical/all]]"]
---

Every Tier C source runs here; proving ground must record ToS verdict before enabling.

Gotchas: per source

Compliance: Manifest must carry tos_reviewed_at + verdict.

