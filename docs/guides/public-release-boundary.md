# Public release boundary

OpenOcti is an independent installation. Public releases must never inherit another installation's operating records, credential store, environment files, protected configuration, or backups.

## Enforced release path

1. The private-source exporter reads only the explicit approved source list from one committed Git ref. It materializes Git blobs into a temporary source snapshot. It does not read working-folder file contents, local environment files, or the live data directory. New source paths require an explicit reviewed allowlist change.
2. Sample records and opaque assets must match the pinned public policy. Changing a sample instruction or business record fails verification, even if its schema still looks valid.
3. The exporter writes an exact canonical-content inventory, `OPENOCTI_BOUNDARY.json`. Verification rejects unexpected, missing, or changed source files, symlinks, operational databases, private deployment configuration, and detected secrets. Verification never regenerates the manifest.
4. An independent Gitleaks scan uses default rules and ignores repository suppression files and inline suppressions. Missing or failing verification tools stop the release. Diagnostics report rule and path information without secret values.
5. The configured public Git pre-push hook checks the exact outgoing commit before upload. GitHub's boundary job runs before dependency installation or image publishing. Registry write permissions are restricted to jobs that depend on that successful check.

## Operator checks

Use `node scripts/verify-openocti-boundary.mjs .` in a committed public checkout. Use `--export` when validating an unstaged export folder. The latter rejects local runtime artifacts instead of treating them as installation data.

Public release checkouts must configure `git config core.hooksPath .githooks`. Hooks are local Git configuration and do not automatically activate when someone clones a repository. The hook requires Node.js and Gitleaks on PATH; missing tools cause a failed push.

Installed runtime data is not part of the approved public source inventory. Normal local `.env`/`.env.local` configuration and ignored runtime data remain installation-owned and are never release inputs. A tracked runtime artifact is rejected even if an ignore rule names its directory.

## Proof and limits

Regression tests exercise synthetic secrets, a private-business sentinel, disguised SQLite data, changed sample records, missing and extra inventory files, symlinks, and source-list violations. The tests do not require real operating records or credential values.

These controls enforce the supported release path. An administrator can intentionally change code, approval policies, local hooks, or repository rules; application checks cannot remove that administrative authority. Pattern-based scanning also cannot recognize every possible secret or business record. The approved source list, pinned data policy, and isolated source snapshot provide independent controls instead of relying on pattern scanning alone.
