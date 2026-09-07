# Releasing OpenOcti

Only release a reviewed, clean source tree. The versioned exporter is the public boundary: never copy live credentials, local environment files, build output, or private business data into a release.

The image publisher calls the complete reusable OpenOcti CI workflow at the same revision. Both image build and publication depend on its success, including secret scanning, documentation checks, tests, production build, and fresh keyless Docker smoke checks. This gate also applies to version tags and manual image runs.

Before exporting a shared feature, record its approved private Command Center revision and deployment status in the release review. Shared improvements must reach the owner's approved private release first; explicitly identify public-only onboarding or packaging changes as exceptions. A different label or commit SHA alone is not a parity check: compare committed trees and deployed behavior. Resolve divergent private release branches through a reviewed pull request, and deploy only the resulting approved, passing GitHub revision. Never promote a dirty working tree or copy private runtime data to establish parity.

1. Prepare `docs/releases/X.Y.Z.md` and run the public test suite.
2. Review the explicit export-source allowlist and commit approved source changes. Run `node scripts/export-openocti.mjs --version X.Y.Z`; it reads only those committed Git objects.
3. Confirm `package.json` and `VERSION.json` contain the requested version.
4. Confirm the exporter reports a clean privacy scan and `gitleaks: PASS (0 findings)`. Run `node scripts/verify-openocti-boundary.mjs /path/to/openocti-export --export`; do not regenerate its approval manifest during validation.
5. Run `npm test` and `npm run build` in the exported tree.
6. Build a fresh Docker Compose project and verify login, health, keyless behavior, samples, imports, and OpenClaw.

Publish only the exact verified export. Configure the public release checkout with `git config core.hooksPath .githooks`; Node.js and Gitleaks must be available. Make one public release commit directly above the actual public `main`, so unrelated or intermediate private history cannot be uploaded. Push the release branch through the hook, wait for required public CI checks, and merge its pull request. Update the checkout to the approved public `main` before creating the version tag. Never reuse or move a published tag. Back up the `/data` volume before upgrading an installed stack.

See [Public release boundary](guides/public-release-boundary.md) for the enforcement layers, synthetic regression checks, and administrative limits.
