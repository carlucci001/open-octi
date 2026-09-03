Closed-path rule: anything under portal, billing, research, or concierge stays closed; everything else ships.

# Releasing OpenOcti

Run a release only from an approved, clean Farrington Command Center `master`. The exporter is the release boundary: never copy files around it, never add live credentials, and stop if its privacy scan or gitleaks check fails.

## 1. Choose the version

Use semantic versioning:

- Patch (`X.Y.Z+1`) for compatible fixes.
- Minor (`X.Y+1.0`) for compatible features.
- Major (`X+1.0.0`) for upgrade-affecting changes.

Prepare `openocti/docs/releases/X.Y.Z.md` before exporting.

## 2. Export from Command Center

On the Windows development machine, from `C:\dev\farrington-command-center`:

```powershell
git switch master
git status --short
node scripts/export-openocti.mjs --version X.Y.Z
```

The command must finish with the privacy scan clean and `gitleaks: PASS (0 findings)`. Confirm `C:\dev\openocti-export\package.json` and `C:\dev\openocti-export\VERSION.json` both contain `X.Y.Z`.

## 3. Run the public checks

From `C:\dev\openocti-export`, run the same checks as public CI:

```powershell
npm ci --include=dev
npm test
npm run build
docker build --tag openocti-ci .
```

Do not continue unless every check passes.

## 4. Sync the public repository

Sync `C:\dev\openocti-export` into `C:\dev\octi-public`. Replace the public working tree with the export, but preserve `C:\dev\octi-public\.git` and keep the exported `.env.example`. Do not carry `node_modules`, `.next`, local environment files, or any file absent from the export.

Review `git status --short` and the complete diff in `C:\dev\octi-public`. Stage only the reviewed release files.

## 5. Commit, tag, and publish

From `C:\dev\octi-public`:

```powershell
git commit -m "OpenOcti X.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
gh release create vX.Y.Z --notes-file docs/releases/X.Y.Z.md
```

The commit and tag must point to the same release tree. Never force-push or reuse an existing version tag.

## 6. Confirm public CI

Find the workflow run for the pushed commit and wait for it to finish:

```powershell
gh run list --workflow ci.yml --branch main --limit 5
gh run watch RUN_ID --exit-status
```

The release is complete only when the OpenOcti CI run is green. If CI fails, fix the source in Farrington Command Center and produce a new patch version through this runbook; do not patch only the public repository.
