# Deployment / 部署

## Local / 本机

```sh
npm ci
npm run build
npm start
```

Node >=22.19. Defaults to `127.0.0.1:4173`. The `yard` and `road` engines work
without Python. To enable the optional Chrono worker, install Python 3.12 and
PyChrono 10 in an independent environment and set an absolute
`GROUNDWORK_CHRONO_PYTHON` path. The worker uses the core NSC/Bullet engine only.

## robots preview / robots 预览

- Base directory: `/home/steven/src/groundwork`
- URL: `http://10.1.153.185:5180` (or `http://robots:5180` if your DNS resolves it)
- Releases: `releases/<release-id>`; `current` selects the active release.
- Current preview: `20260928-park-platform-01`; park platform at `/`, old engine
  lab at `/workbench`, map library at `/maps`. See [platform review](changes/product-platform/review.md).
  Previous `20260928-rmf-maps-02` and `20260928-integration-03` are retained.
- Independent runtime: `.tools/node/bin/node`, `.venv-chrono/bin/python`.
- Persistent evidence: `data/runs`; resource database: `data/platform.sqlite`
  (SQLite WAL, schema 1). Process identity: `service.json`; log: `server.log`.
- The original 5173–5176 demos are not stopped or repurposed.

```sh
ssh robots 'python3 /home/steven/src/groundwork/current/scripts/service.py status'
ssh robots 'python3 /home/steven/src/groundwork/current/scripts/service.py stop'
ssh robots 'python3 /home/steven/src/groundwork/current/scripts/service.py start'
```

The helper verifies PID command-line identity before stopping a process. It does
not install system services or boot autostart. After machine reboot, start it
explicitly. The preview is a background application requested by the maintainer,
not a recurring monitoring agent.

Runtime installation on 2026-09-28 used the already-installed Node 24.13.1 binary
as a source for a separate copy, and micromamba's offline clone to relocate the
existing third-party PyChrono 10 environment into `.venv-chrono`. Neither original
runtime directory is needed after installation; application source/assets were
not shared by symlink. Archive/package-cache use during installation is not a
runtime dependency on the old products.

Release procedure: build/test locally; archive only application files, compiled
workspace packages, and runtime npm dependencies; extract into a **new** release
directory; stop only GroundWork; switch `current`; start and smoke-test. Never
overwrite a live release or use blanket `pkill` against Node/Python/Gazebo.
Rollback selects a retained release after stopping GroundWork; evidence remains
in `data/runs`. Do not select an older release whose schema cannot read newer data.

## Security boundary / 安全边界

This is a **trusted-LAN preview without authentication**, not internet-hosted SaaS.
Only explicitly allowed Host headers are accepted; browser POSTs must carry a
same-origin Origin header and JSON content type. The static server cannot serve
source-side server code, environment files, job files or arbitrary node_modules.
These guards are not a substitute for user auth, TLS or tenant isolation.

Anyone with access to the allowed LAN endpoint can read/write resources, read
experiments, start bounded jobs and cancel jobs. The maintainer explicitly selected
single-user/no-login for this batch. Use synthetic/non-sensitive data only. Do not add public
port forwarding, a public tunnel, real vehicle commands or external model calls
without explicit permission. Protect the data directory through OS permissions.

The job queue is single-process: do not start two servers sharing one data directory.
Workers are subprocess-isolated for cancellation, not a sandbox for arbitrary code;
requests cannot choose an executable, filesystem path or shell command. Monitor
disk usage; no automatic data deletion is enabled.
