# Releasing OpenOcti

Only release a reviewed, clean source tree. The versioned exporter is the public boundary: never copy live credentials, local environment files, build output, or private business data into a release.

1. Prepare `docs/releases/X.Y.Z.md` and run the public test suite.
2. Review the explicit export-source allowlist and commit approved source changes. Run `node scripts/export-openocti.mjs --version X.Y.Z`; it reads only those committed Git objects.
3. Confirm `package.json` and `VERSION.json` contain the requested version.
4. Confirm the exporter reports a clean privacy scan and `gitleaks: PASS (0 findings)`. Run `node scripts/verify-openocti-boundary.mjs /path/to/openocti-export --export`; do not regenerate its approval manifest during validation.
5. Run `npm test` and `npm run build` in the exported tree.
6. Build a fresh Docker Compose project and verify login, health, keyless behavior, samples, imports, and OpenClaw.

Publish only the exact verified export. Configure the public release checkout with `git config core.hooksPath .githooks`; Node.js and Gitleaks must be available. Make one public release commit directly above the actual public `main`, so unrelated or intermediate private history cannot be uploaded. Push the release branch through the hook, wait for required public CI checks, and merge its pull request. Update the checkout to the approved public `main` before creating the version tag. Never reuse or move a published tag. Back up the `/data` volume before upgrading an installed stack.

See [Public release boundary](guides/public-release-boundary.md) for the enforcement layers, synthetic regression checks, and administrative limits.
