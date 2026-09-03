# Releasing OpenOcti

Only release a reviewed, clean source tree. The versioned exporter is the public boundary: never copy live credentials, local environment files, build output, or private business data into a release.

1. Prepare `docs/releases/X.Y.Z.md` and run the public test suite.
2. Run `node scripts/export-openocti.mjs --version X.Y.Z`.
3. Confirm `package.json` and `VERSION.json` contain the requested version.
4. Confirm the exporter reports a clean privacy scan and `gitleaks: PASS (0 findings)`.
5. Run `npm test` and `npm run build` in the exported tree.
6. Build a fresh Docker Compose project and verify login, health, keyless behavior, samples, imports, and OpenClaw.

Publish only the exact verified export. Commit and tag the same tree, then wait for public CI to pass. Never reuse or move a published tag. Back up the `/data` volume before upgrading an installed stack.
