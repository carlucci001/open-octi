---
id: "cms-nppes"
name: "CMS NPPES NPI Registry"
level: "federal"
coverage: ["US"]
triggers: ["new-practice"]
verticals: ["med-spas-dental","specialty-clinics","healthcare"]
platform: "rest-generic"
tier: "A"
endpoint: "https://npiregistry.cms.hhs.gov/api/"
request: {"method":"GET","query":{"version":"2.1","address_purpose":"LOCATION","postal_code":"{zip}","limit":"{limit}","skip":"{offset}"},"rowsPath":"results"}
fields: {"externalId":"number","triggeredAt":"basic.enumeration_date","name":"basic.organization_name","organizationName":"basic.organization_name","firstName":"basic.first_name","lastName":"basic.last_name","credential":"basic.credential","entityType":"enumeration_type","phone":"addresses.0.telephone_number","line1":"addresses.0.address_1","city":"addresses.0.city","state":"addresses.0.state","zip":"addresses.0.postal_code"}
auth: {"type":"none"}
cadence: "real-time API; weekly file"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.8,"contactability":0.4},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-practice]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/med-spas-dental]]","[[vertical/specialty-clinics]]","[[vertical/healthcare]]"]
---

Best all-round free source: exact open date, phone, specialty. Address is sometimes a billing service.

Gotchas: org/provider name, practice + mailing address, PHONE, taxonomy (specialty), enumeration date

Compliance: Public directory; not HIPAA-restricted.
