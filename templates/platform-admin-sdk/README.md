# Platform Admin SDK scaffold

Copy this directory into a new product on day one. It provides the Platform Admin v2 DTO validators, bearer middleware, manifest builder, route stubs, and contract tests without importing Command Center code.

## Register in Command Center

1. Implement the five handlers returned by `createPlatformAdminRouteStubs()` under `/api/platform-admin/v1/`.
2. Publish `buildPlatformManifest()` at `/.well-known/farrington-platform.json` and declare only capabilities the product actually serves.
3. Put the bearer key in the product's secret store. Put the same key in Command Vault, then register the product in Command Center using the vault credential name—never paste the key into the platform record.
4. Run `npm test` in this scaffold before registering or deploying the product.

Bearer authentication is the current contract. `createBearerMiddleware()` exposes a `verifyHmac` extension hook, but HMAC itself is intentionally deferred to Phase 3.
