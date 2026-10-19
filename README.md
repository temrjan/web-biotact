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

The website framework, application code and application dependencies have not been introduced. AI consultant requirements are recorded in DocHub; implementation and evaluation wait for that feature's stage.

## Repository checks

Run `bash scripts/ci.sh` from a full Git checkout on Linux x86_64. It requires Bash, Git, curl, tar and sha256sum. The script downloads pinned actionlint, ShellCheck and Gitleaks releases into the ignored `.cache/ci` directory, verifies their SHA-256 checksums, validates all workflows and shell scripts, and scans the complete available Git history for secrets with redacted output. Uncommitted files are not part of the history scan. This scan does not replace GitHub push protection.

GitHub Actions runs the same command for every pull request and every push to `main`; manual runs are also available once the workflow is on `main`. All files are in scope because a secret can be introduced anywhere. Dependabot version updates, security updates and alerts are disabled at the owner's request. Maintain action pins and CLI versions/checksums manually through reviewed changes; CLI pins are in `scripts/ci.sh`.

Application lint, type checking, tests and production build must be added using the chosen framework's actual commands and lockfile when application code is introduced. Repository checks alone do not establish application readiness.

## Delivery

The intended production destination is the existing Biotact server. Production delivery will be a separate manual workflow, restricted to the accepted `main` revision after successful application CI, with verified SSH host identity, deployment serialization, a health check and a defined rollback. Its executable commands depend on the application build/runtime contract. No deploy workflow or server credentials are installed yet. The existing Tilda site remains live until the website is ready for the planned `biotact.uz` cutover. Working decisions and remaining setup inputs are recorded in DocHub.
