# Security Policy

OpenOcti holds CRM records, documents, and agent credentials, so security reports are taken seriously.

## Reporting a vulnerability

Do not open a public issue for an exploitable vulnerability. Use GitHub private vulnerability reporting from the repository Security tab. Maintainers will acknowledge the report and coordinate a fix or mitigation before public disclosure.

Non-exploitable hardening suggestions may be filed as regular issues.

## Supported versions

Security fixes target the latest published OpenOcti release. Community support does not include an SLA.

## Self-hosting responsibility

Operators are responsible for host security, network exposure, TLS, backups, access control, and protection of provider keys. Keep secrets only in `.env` or a secret manager; never commit them.
