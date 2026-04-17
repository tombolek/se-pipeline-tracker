# Build & Deploy

> **This is a manual deploy — there is no CI/CD pipeline.** Deploys are triggered by running a shell script from WSL.

## Environment

- Developer machine: **Windows + WSL2 (Ubuntu)**.
- AWS CLI is installed on **Windows** (`C:\Program Files\Amazon\AWSCLIV2\aws.exe`), symlinked into WSL at `~/bin/aws`.
- All deploy commands must be run **inside WSL** with the symlink on PATH.

## How to deploy

Always run from WSL, not PowerShell or CMD:

```bash
# Full deploy (frontend + server) — use when server code changed
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker && bash scripts/deploy.sh'

# Frontend only — use for UI/client-only changes (faster, ~60s)
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker && bash scripts/deploy.sh --frontend-only'

# Server only — use when only server/src changed (skips Vite build + S3 upload)
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker && bash scripts/deploy.sh --server-only'
```

## What the script does

**Frontend path** (`--frontend-only` or full):

1. Reads CloudFormation outputs (bucket name, CloudFront distribution ID) via `aws cloudformation describe-stacks`.
2. Builds the frontend locally in WSL (`npm run build` in `client/`) — fast and reliable, no EC2 OOM risk.
3. Syncs `dist/` to the S3 frontend bucket with `--delete`.
4. Submits a CloudFront `/*` cache invalidation.

**Server path** (`--server-only` or full):

1. SCPs `server/src`, `server/migrations`, `package*.json`, `tsconfig.json`, `Dockerfile` to EC2 (`/app/server/`).
2. SCPs `docker-compose.prod.yml` and `scripts/backup.sh` to EC2.
3. SCPs `.env.prod.local` to EC2 as `/app/.env.prod`, then appends `BACKUP_BUCKET` and `APP_BACKUP_BUCKET` from CDK outputs (these are never in `.env.prod.local`).
4. Runs `docker compose build server` on EC2 (compiles TypeScript inside the container).
5. Runs `docker compose up -d` — only the server container is recreated; DB container is left running.

## Infrastructure changes (CDK)

When `infra/lib/stack.ts` is modified (new bucket, new IAM permission, new output, etc.):

```bash
wsl -e bash -ic 'export PATH="$HOME/bin:$PATH" && cd /mnt/c/claude/buddy/se-pipeline-tracker/infra && npx cdk deploy --require-approval never'
```

After CDK deploy, always run a full or server-only deploy so EC2's `.env.prod` picks up any new CloudFormation outputs.

## Key files

| File | Purpose |
|------|---------|
| `scripts/deploy.sh` | The only deploy script — all three modes |
| `.env.prod.local` | Production secrets (never committed). Copy from `.env.example` |
| `infra/lib/stack.ts` | CDK stack — EC2, S3 buckets, CloudFront, IAM role |
| `docker-compose.prod.yml` | Production compose (server + postgres) |
| `client/.env.production` | Vite env — sets `VITE_API_URL=/api/v1` for production build |

## Changelog

`CHANGELOG.md` in the repo root must be updated with every user-facing change — add the entry in the same commit as the feature. This keeps docs updates cheap: future README/HowTo updates only require reading the changelog rather than reconstructing history from commits.

**What to include:** new features, behaviour changes, removals. Skip pure bug fixes, TS errors, deploy script tweaks, and refactors that don't change what the user sees.

**Format:**

```markdown
## YYYY-MM-DD

### Added
- Short description of the feature — one line is enough. (Issue #N if applicable)

### Changed
- What changed and why, if the old behaviour was intentional.

### Removed
- What was removed.
```

Add new entries at the top, under `## [Unreleased]` if the date isn't known yet, or directly under a dated heading.

## After any validated feature

Always commit, push, and deploy without being asked (hard rules — see [CLAUDE.md](../CLAUDE.md)). The sequence is:

1. `git add <files> && git commit -m "[fe] ..."` — use `[fe]`, `[be]`, `[fe+be]`, or `[infra]` tag.
2. `git push origin master`.
3. Run the appropriate deploy command above (frontend-only if only client changed, full if server changed).

## Hard "don't"s — see [gotchas.md](gotchas.md)

- Never use `preview_*` tools or start a local dev server.
- Never run `deploy.sh` from PowerShell or CMD.
- Never `npm install` the client on Windows (use WSL).
- Never skip `export PATH="$HOME/bin:$PATH"` in WSL commands.
- No GitHub Actions, no webhooks — commit → push → deploy manually.
