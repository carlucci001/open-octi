# Security Policy

OpenOcti holds CRM records, documents, and agent credentials, so security reports are taken seriously.

## Reporting a vulnerability

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/carlucci001/open-octi/security/advisories/new). Include the affected version, impact, and a minimal reproduction using synthetic data. Do not include live credentials or customer records.

Public Issues and Discussions are **not** for security reports. Keep reproduction details private while maintainers investigate and coordinate a fix or mitigation.

We aim to acknowledge reports within three business days and provide an initial assessment within seven business days. Complex reports may take longer; we will share progress privately. These are response goals, not an SLA.

Non-exploitable hardening suggestions may be filed as regular issues.

## Supported versions

Security fixes target the latest minor release line (currently 1.1.x). Install its newest patch release; older minor versions are unsupported. Versions 1.0.0 through 1.1.1 require the security fixes in 1.1.2.

## Self-hosting responsibility

Operators are responsible for host security, network exposure, TLS, backups, access control, and protection of provider keys. Use Models & Keys, a protected `.env`, or a secret manager; never commit credentials. Automatically generated machine secrets are stored in `CRM_DATA_DIR/openclaw/machine-secrets.json`, private to the app user. Back up this file securely with the data volume.
