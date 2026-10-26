# web-biotact

Independent Biotact browser storefront, intended for `biotact.uz`.

This repository owns the website application and its future build/release lifecycle. It uses the existing Shop business API and canonical accounts, catalogue, orders and Club data. The shared API, database migrations, Telegram Mini App, bot and existing administrator application remain in the `miniapp-biotact` project.

## Documentation

The canonical working documentation is in the existing private DocHub:

- Project entry: `/home/temrjan/Dev/DocHub/web-biotact/README.md`.
- Single task record: `/home/temrjan/Dev/DocHub/web-biotact/tasks/independent-web-frontend/TASK.md`.

Plans, research, reviews and evidence are maintained there without a second copy in this repository. Product usage/build instructions belong here as implementation is added.

## Workspace

Use the sole working directory `/home/temrjan/Dev/projects/web-biotact` and follow [AGENTS.md](AGENTS.md). Shared backend work uses `/home/temrjan/Dev/projects/miniapp-biotact`.

The root application uses React 19, strict TypeScript 5.9 and Vite 7. It implements Telegram buyer sign-in and the current buyer’s minimal Club summary. AI consultant requirements are recorded in DocHub; implementation and evaluation wait for that feature's stage.

## Repository checks

Run `bash scripts/ci.sh` from a full Git checkout on Linux x86_64. It requires Bash, Git, curl, tar and sha256sum. The script downloads pinned actionlint, ShellCheck and Gitleaks releases into the ignored `.cache/ci` directory, verifies their SHA-256 checksums, validates all workflows and shell scripts, and scans the complete available Git history for secrets with redacted output. Uncommitted files are not part of the history scan. This scan does not replace GitHub push protection.

GitHub Actions runs the same command for every pull request and every push to `main`; manual runs are also available once the workflow is on `main`. All files are in scope because a secret can be introduced anywhere. Dependabot version updates, security updates and alerts are disabled at the owner's request. Maintain action pins and CLI versions/checksums manually through reviewed changes; CLI pins are in `scripts/ci.sh`.

Use the exact Node version in `.node-version` and npm version in `package.json`:

```bash
npm ci
npm run dev
npm run lint
npm run type-check
npm test
npm run build
```

The static output is `dist/` (ES2022 target). Serve it on the configured HTTPS
buyer origin, forwarding same-origin `/api/v1` requests to the existing Shop API.
No API origin or credential belongs in the browser build. Backend/session,
Telegram-entry and Club switches remain independently controlled by that API.

For a local view of the actual public assortment, use the existing installed
tools from this folder:

```bash
npm run build && BIOTACT_PUBLIC_CATALOGUE_PREVIEW=1 npm run preview -- --port 4187 --strictPort
```

Open `http://127.0.0.1:4187/`; stop with Ctrl+C. This optional preview serves
`dist/` on loopback only and reads the fixed `https://app.biotact.uz` public
catalogue with normal TLS verification. It allows only GET category/product
lists and positive-integer product details, retaining W1 language, search and
paging parameters. It strips credentials, refuses all other API paths/methods
locally, and refuses upstream redirects. Account/authentication is unavailable
in this catalogue-only mode. An external/wildcard `--host` is rejected. The
process-only flag is off unless its exact value is `1`; ordinary dev/build,
preview and synthetic/native browser ingress keep their existing behavior.
This local viewing mode does not establish production release acceptance.

`npm run test:browser` runs Chromium against a local synthetic HTTPS ingress and
the sole sibling Shop folder’s `tests/tg1_browser_server.py`. The latter creates
a named disposable PostgreSQL16 database owned by the explicitly selected
synthetic loopback test server, disables dotenv/Sentry and external delivery, and
uses the actual API/session issuer/SQL. Set `TG1_API_ROOT`, `TG1_PYTHON` and
`TG1_BROWSER_DATABASE_URL` to the permitted local test resources; defaults target
the sibling project and the named TG1 fixture. Never point it at customer data.
Tests cover two-tab held-cookie orderings, lost success responses, restoration,
logout, QR/link entry and preservation of unrelated basket storage.

CI runs `TG1_BROWSER_BOUNDARY=1 npm run test:browser`: a real browser and HTTPS
cookies against the explicit synthetic API boundary in `tests/boundary.mjs`.
It verifies UI behavior, not native Shop authentication. The Shop CI owns its
API/native/bot integration suites; local paired browser/API checks remain
necessary. Private cross-repository credentials are not installed by this setup.
An email-only capability check runs with `TG1_BROWSER_EMAIL_ONLY=1 npm run test:browser:email`; it must hide Telegram without creating a request.
Repository checks, application checks and this browser UI command are separate
CI jobs/steps. Dependabot remains disabled.

## Delivery

The intended production destination is the existing Biotact server. Production delivery will be a separate manual workflow, restricted to the accepted `main` revision after successful application CI, with verified SSH host identity, deployment serialization, a health check and a defined rollback. Its executable commands depend on the application build/runtime contract. No deploy workflow or server credentials are installed yet. The existing Tilda site remains live until the website is ready for the planned `biotact.uz` cutover. Working decisions and remaining setup inputs are recorded in DocHub.
