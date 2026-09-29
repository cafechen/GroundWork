# GroundWork

**Back to the fundamentals.** Industrial-vehicle simulation and evidence under the Ground brand.

[简体中文](README.zh-CN.md) · [Documentation](docs/README.md) · [Architecture](docs/architecture.md) · [Database](docs/database/README.md)

## Architecture

TypeScript, Next.js App Router, React, actual shadcn/ui (Radix), Tailwind CSS, TanStack Query and Three.js. Next.js owns pages and API routes; a persistent TypeScript worker executes simulations. Prisma uses **MySQL by default**. PostgreSQL has a generated schema and separate SQL migrations, but has **not yet passed live PostgreSQL integration tests**. Switching requires client generation, migrations and explicit data transfer—not just a URL change.

The application is standalone: no Strategist/Robots runtime imports, services or credentials are required. Python Chrono remains optional. This refactor does not add Gazebo or replace the physics models.

## Start locally

Requires Node.js **22.19+**, a dedicated MySQL 8+ database and a modern browser. Configure `.env.local` using [.env.example](.env.example). Never use another application's business database or commit credentials. Next.js and the Prisma provider generator read `.env.local`; direct Prisma CLI, seed/import scripts and worker need explicit environment loading:

```sh
npm ci
node --env-file=.env.local scripts/prisma-provider.mjs --generate
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy --schema prisma/mysql/schema.prisma
node --env-file=.env.local --import tsx scripts/seed-next.ts
npm run build
npm start
# Second terminal:
node --env-file=.env.local --import tsx workers/runner.ts
```

Seed requires an empty resource database. Development: `npm run dev` plus the same worker. Open **http://127.0.0.1:4173**. Stop both processes with Ctrl+C. Without a worker, jobs remain queued. This is a **trusted-LAN, single-user, no-login preview**, not a public service. See [deployment](docs/deployment.md).

For subsequent same-schema updates to the existing robots preview, use
`node scripts/deploy-robots.mjs deploy --apply` from a clean, tested, committed
checkout. [Self-service deployment](docs/deploy-robots.md) includes read-only
planning/status, restart after reboot, safeguards and limits; no automatic DB migrations/imports.

The shadcn-admin UI revision **`2bfe8b2`** is now deployed at
**http://10.9.0.20:5180**, with existing data retained and read-only browser/replay
checks passed. [Deployment verification](docs/changes/robots-deploy-script/review.md).

## Product workflow

The admin interface now adapts the **shadcn-admin** template: collapsible sidebar,
mobile drawer, light/dark themes, real-resource overview and filterable lists.
See [UI guide and authentication boundary](docs/admin-ui.md). The UI adaptation
does not change simulation models; the requested login backend remains a separately
reviewed stage, not a fake template login.

Five menus: **Overview, Maps, Device models, Gateways, Parks**. Each park contains Overview, Scene editor, Devices, Operations, Control panel, Analytics and Settings.

1. Reuse/import maps, define models and register gateway configuration.
2. Create a park, pin map/model versions and bind gateways.
3. In 2D, select the route tool, click at least two points, finish the route and **save the scene**.
4. Create a virtual device; pick its spawn or use a saved route's start. Full-body clearance still requires validation.
5. Create a same-map/floor task, simulate, replay frozen results in 2D/3D and inspect metrics.

[Park manual](docs/park-platform.md) · [Prechecked yard example](docs/quickstart.md) · [Troubleshooting](docs/troubleshooting.md). `completed` means computation ended, not a safety verdict.

Five bundled RMF maps: Hotel, Office, Airport Terminal, Clinic and Campus. Manufacturing & Logistics awaits source. Campus is topology-only; external meshes are absent. React map preview supports floor selection, 2D/3D, graph/layer filters, facility overlays and JSON export.

Virtual tugger/forklift/AMR tasks retain planar kinematics, explicit routes, wall/restricted-zone contacts and speed zones. Quadrupeds are definition-only. Sensor/mass declarations do not create perception/dynamics. Physical devices/gateways remain **configuration only**: no telemetry, video, point clouds or takeover.

## Laboratories and compatibility

`/workbench` provides React yard, road and optional Chrono experiments; `/classic` is the yard-only entry. Jobs use the durable database queue. Replay, cancellation, baseline comparison and guarded JSON/HTML/XOSC/RMF/SDF exports are available. The 12-run yard action atomically persists six matched pairs, with refresh-safe history, aggregate metrics, cancellation and JSON/CSV/HTML reports. Incomplete or incompatible pairs never count as passing.

Map previews include navigation-graph filters, independent lane/wall/door/lift/model-position layers and optional waypoint names in 2D/3D. These are display controls, not changes to collision geometry; model markers are not vendor meshes.

Chrono remains a separate synthetic mechanics world, not arbitrary park maps. Set `GROUNDWORK_CHRONO_PYTHON` to a verified PyChrono interpreter. Engines model different vehicles, not interchangeable calibrated backends. Ground contacts are not accident counts. This refactor does not claim a new live Chrono execution test.

Old JavaScript UI/server files remain as explicit compatibility and regression baselines: `npm run legacy:start`. They are **not proxied by Next.js**. Historical A/B/C/D screenshots/manuals describe the old server, not pixel-equivalent React screens.

## Data and checks

18 relational tables normalize resources and park-owned instances/objects/tasks. Immutable revisions, run inputs, leases, artifact checksums and audit events preserve evidence. Frames default to `data/next-runs`. JSON columns use versioned text envelopes to preserve floating-point geometry through Prisma; repositories decode them. See [table dictionary and migration](docs/database/README.md).

SQLite/run importers default to dry-run and require explicit source paths. Apply only to dedicated empty targets after backup; source files remain unchanged. The trusted-VPN robots preview was deployed on 2026-09-29 from `baaa97b`, with old resources/history imported into a separate MySQL database. See [deployment evidence](docs/changes/robots-nextjs-deployment.md). This is not a production release or boot-enabled service.

```sh
npm run build
npm test
npm run test:next
npm run test:engines
npm run check
npm run lint
# Explicit isolated groundwork_* test database required; stop the normal worker:
node --env-file=.env.local --import tsx --test tests-next/database.integration.js
```

[Testing](docs/testing.md) and [change review](docs/changes/nextjs-platform/review.md) record actual evidence. Six private-map engine suites remain excluded, not counted as passing. Tests are not industrial safety certification.

## AI-native SDLC

Overall reference: [The AI-native SDLC playbook](https://claude.com/blog/the-ai-native-sdlc-playbook). Record intent/spec/plan and maintainer approval before implementation; reproduce defects and add regression evidence; review logic, security and scope separately. Keep numerical engines outside UI, preserve units/model identities, synchronize both languages and never weaken physics checks to obtain PASS.

[AGENTS.md](AGENTS.md) and [development policy](docs/development-policy.md) govern work. Same-session review is self-review, not independent approval. Written rules do not prove enforced CI gates or full adoption. Commit, push, deployment, uploads and real control require corresponding authorization.

## License

[MIT](LICENSE) for original code. See [third-party notices](THIRD_PARTY_NOTICES.md) and [source provenance](docs/source-provenance.md). Do not upload customer maps, logs or credentials without permission.
