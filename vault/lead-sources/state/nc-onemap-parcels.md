---
id: "nc-onemap-parcels"
name: "NC OneMap statewide parcels (all 100 counties)"
level: "state"
coverage: ["NC"]
triggers: ["new-homeowner"]
verticals: ["home-services","real-estate","insurance-agencies"]
platform: "arcgis"
tier: "A"
endpoint: "https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1"
request: {"method":"GET","where":"stcntyfips = '{countyFips}'","dateFilter":true,"outFields":"objectid,parno,ownname,mailadd,mcity,mstate,mzip,saledate,parval,cntyname,cntyfips,stcntyfips","orderByFields":"saledate DESC","pageSize":200}
fields: {"externalId":"objectid","triggeredAt":"saledate","name":"ownname","line1":"mailadd","city":"mcity","state":"mstate","zip":"mzip","county":"cntyname","price":"parval"}
auth: {"type":"none"}
cadence: "lags county layers by weeks–months"
compliance: {"channels":["mail","email-b2c"],"dppa":false,"fcra":false,"tosReviewedAt":"2026-09-03","tosVerdict":"public-records"}
proving: {"thresholds":{"freshness":0,"geoPrecision":0.8,"mailAddress":0.95},"status":"candidate"}
discovered: false
excludedReason: null
links: ["[[trigger/new-homeowner]]","[[jurisdiction/NC]]","[[platform/arcgis]]","[[vertical/home-services]]","[[vertical/real-estate]]","[[vertical/insurance-agencies]]"]
---

One adapter covers Henderson/Haywood/Madison/McDowell; cross-check freshness against county layer.

Gotchas: owner name, mailing address, site address, sale date, values, land use, county

Compliance: Deed data marketing is legal; geography/property targeting only (Fair Housing).
