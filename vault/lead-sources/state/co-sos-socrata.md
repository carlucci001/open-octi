---
id: "co-sos-socrata"
name: "Colorado Business Entities (Socrata)"
level: "state"
coverage: ["CO"]
triggers: ["new-business"]
verticals: ["new-businesses","all-b2b"]
platform: "socrata"
tier: "A"
endpoint: "https://data.colorado.gov/resource/4ykn-tg5h.json"
request: {"method":"GET","where":"entityformdate >= '{since}' AND entityformdate < '{until}'","order":"entityformdate DESC"}
fields: {"externalId":"entityid","name":"entityname","line1":"principaladdress1","city":"principalcity","state":"principalstate","zip":"principalzipcode","people":[{"name":[{"join":["agentfirstname","agentmiddlename","agentlastname"]},"agentorganizationname"],"title":"Registered agent"}],"entitytype":"entitytype","entitystatus":"entitystatus","triggeredAt":"entityformdate"}
auth: {"type":"none"}
cadence: "daily"
compliance: {"channels":["mail"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-12","tosVerdict":"public-open-data"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0.4,"mailAddress":0.8},"status":"proven"}
discovered: false
excludedReason: null
links: ["https://data.colorado.gov/d/4ykn-tg5h","https://data.colorado.gov/api/views/4ykn-tg5h.json"]
---

Public-record lead source.

Gotchas: entity, status, formation date, addresses, agent

Compliance: CO SB23-037: solicitations must disclose private sender + where to get the record free.

