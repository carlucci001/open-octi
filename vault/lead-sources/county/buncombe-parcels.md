---
id: "buncombe-parcels"
name: "Buncombe County parcels (Property_2025 layer)"
level: "county"
coverage: ["NC-Buncombe"]
triggers: ["new-homeowner"]
verticals: ["home-services","real-estate","insurance-agencies","remodeling-specialty-trades"]
platform: "arcgis"
tier: "A"
endpoint: "https://gis.buncombecounty.org/arcgis/rest/services/opendata_2/MapServer/17"
request: {"method":"GET","where":"1=1","dateFilter":true,"outFields":"*","orderByFields":"DeedDate DESC","pageSize":200}
fields: {"externalId":"PIN","triggeredAt":"DeedDate","name":"Owner","line1":"Address","city":"CityName","state":"State","zip":"Zipcode","county":"Buncombe","price":"SalePrice"}
auth: {"type":"none"}
cadence: "county-current"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.8,"mailAddress":0.95},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-homeowner]]","[[jurisdiction/NC-Buncombe]]","[[platform/arcgis]]","[[vertical/home-services]]","[[vertical/real-estate]]","[[vertical/insurance-agencies]]","[[vertical/remodeling-specialty-trades]]"]
---

Verified live, field-level. Best new-homeowner source for WNC.

Gotchas: Owner, Address, CareOf, mailing City/State/Zip, DeedDate, DeedBook/Page, SalePrice, TotalMarketValue, LandUse, PIN

Compliance: Direct mail + name/address append; no demographic targeting.
