---
id: "epa-echo"
name: "EPA ECHO / Envirofacts (facility registry)"
level: "federal"
coverage: ["US"]
triggers: ["new-facility"]
verticals: ["manufacturing","industrial"]
platform: "rest-generic"
tier: "A"
endpoint: "https://echodata.epa.gov/echo/echo_rest_services.get_facilities"
request: {"method":"GET","query":{"output":"JSON","p_zip":"{zip}","responseset":"{limit}"},"rowsPath":"Results.Facilities"}
fields: {"externalId":["RegistryID","FRS_ID"],"triggeredAt":["LastInspectionDate","InspectionDate"],"name":["FacName","FacilityName"],"line1":["FacStreet","FacilityAddress"],"city":["FacCity","FacilityCity"],"state":["FacState","FacilityState"],"zip":["FacZip","FacilityZip"]}
auth: {"type":"none"}
cadence: "varies by program"
compliance: {"channels":["mail","email-b2b","manual-phone"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"geoPrecision":0.8,"contactability":0},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-facility]]","[[jurisdiction/US]]","[[platform/rest-generic]]","[[vertical/manufacturing]]","[[vertical/industrial]]"]
---

Use facility start date, not record-creation date.

Gotchas: facility name, address, NAICS, permit dates, FRS ID

Compliance: Public.
