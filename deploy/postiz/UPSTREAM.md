# Bundled Postiz services

The Postiz service is a separate upstream application. OpenOcti connects through its Public API.

Sources checked September 9, 2026:

- Postiz v2.23.0: https://github.com/gitroomhq/postiz-app/releases/tag/v2.23.0
- Canonical Compose source, commit dd4969e5e694cd009619a0d53cff14c21104580b: https://github.com/gitroomhq/postiz-docker-compose/tree/dd4969e5e694cd009619a0d53cff14c21104580b
- Installation documentation: https://docs.postiz.com/self-host/installation/docker-compose
- The Compose repository's license is retained in LICENSE.upstream.txt.

OpenOcti adaptations: installation-specific generated secrets; digest-pinned images; project-scoped service names and volumes; loopback dashboard binding; no published database, Redis, Elasticsearch, or Temporal ports; persistent Redis append-only storage; dependency health checks; and no optional debug/admin dashboards. The Temporal ID limit follows upstream. Its development-only cache-refresh option is omitted.

Review upstream migrations and each image's license before changing versions. Postiz, PostgreSQL, Redis, Elasticsearch, and Temporal retain their respective upstream licenses; OpenOcti's application license does not replace them.

The pinned 2.23.0 image repeatedly stalled its backend during PM2's wrapped Node startup in clean-install and restart acceptance. OpenOcti retains the image and schema initialization but launches its backend, frontend, and orchestrator as direct Node executables under `pm2-runtime`. The adapter is in `start.sh` and `ecosystem.config.cjs`; both are mounted read-only. This also keeps process supervision in the container foreground. Recheck the adapter when upgrading the upstream image because it names that version's compiled application paths.
