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

## Scheduled backup

The nightly app backup (JSON snapshot in Settings → Backup & Restore) is
fired by an EventBridge-scheduled Lambda — **not** by the Express server.

**Why this shape:** in-process `setTimeout` schedulers die on rolling
deploys and run N times across multi-replica deploys, causing missed and
duplicate backups. An external scheduler fires exactly once regardless of
server lifecycle.

**The chain:**

1. **EventBridge rule** (`cron(0 2 * * ? *)`, in `infra/lib/stack.ts`) fires
   the Lambda daily at 02:00 UTC.
2. **Lambda** (`infra/lambda/scheduled-backup.ts`) reads the shared secret
   from SSM at `/se-pipeline/backup-trigger-secret`, then POSTs to
   `https://<app>/api/v1/backup/run-scheduled` with the header
   `X-Backup-Trigger-Secret: <secret>`. The Lambda owns no DB credentials,
   no S3 perms, no VPC attachment — purely a trigger.
3. **Server endpoint** (`server/src/routes/backup.ts → POST /run-scheduled`)
   constant-time-compares the header against `BACKUP_TRIGGER_SECRET` from
   `process.env` (set by `deploy.sh` from the same SSM parameter), then
   calls `createAppBackup('scheduled')` which writes the snapshot to S3.

**Operator one-time setup** (only needed once per environment):

```bash
# Generate + store the shared secret in SSM
aws ssm put-parameter \
  --name /se-pipeline/backup-trigger-secret \
  --value $(openssl rand -hex 32) \
  --type SecureString \
  --region eu-west-1 \
  --overwrite

# Deploy the infra (creates Lambda + EventBridge + IAM)
cd infra && npx cdk deploy --require-approval never

# Push the same secret into /app/.env.prod on EC2
./scripts/deploy.sh --server-only
```

**Rotating the secret:** `aws ssm put-parameter ... --overwrite`, then
`./scripts/deploy.sh --server-only`. The Lambda picks up the new value at
its next cold start (it caches per warm container) — for an immediate
swap, force a new Lambda version with `aws lambda update-function-code`.

**Manual trigger** (for testing the wiring without waiting for 02:00 UTC):

```bash
LAMBDA=$(aws cloudformation describe-stacks --stack-name SePipelineStack \
  --query "Stacks[0].Outputs[?OutputKey=='BackupLambdaName'].OutputValue" \
  --output text)
aws lambda invoke --function-name "$LAMBDA" /tmp/out.json && cat /tmp/out.json
```

Expected: `{"ok":true,"status":200,"elapsedSec":<n>}` and a fresh
`app-backups/<timestamp>_scheduled.json` in the `se-pipeline-app-backups-*`
bucket.

**Failure modes:**
- Lambda's CloudWatch log group: `/aws/lambda/SePipelineStack-ScheduledBackupLambda*`
- HTTP 503 from the endpoint = `BACKUP_TRIGGER_SECRET` env var unset on
  the server (re-run `deploy.sh --server-only`).
- HTTP 401 from the endpoint = secret mismatch (SSM and `.env.prod` got
  out of sync; same fix).
- "SSM parameter has no value" Lambda error = the operator setup step
  above wasn't run.

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

**Commit and push — do NOT deploy.** Deploys are user-triggered only (hard rule — see [CLAUDE.md](../CLAUDE.md#commit--deploy-hygiene)). The agent's sequence is:

1. `git add <files> && git commit -m "[fe] ..."` — use `[fe]`, `[be]`, `[fe+be]`, `[infra]`, or `[docs]` tag.
2. `git push origin master`.
3. **Stop.** Report what shipped and which deploy command *would* apply when the user asks. Do not run `deploy.sh` or `cdk deploy` on your own — not even for "obvious" changes, not even for UI-only tweaks.

The tag on the commit (`[fe]` vs `[be]` vs `[fe+be]` vs `[infra]`) tells the user which deploy command to reach for; it is not a signal to execute it.

## Hard "don't"s — see [gotchas.md](gotchas.md)

- Never use `preview_*` tools or start a local dev server.
- Never run `deploy.sh` from PowerShell or CMD.
- Never `npm install` the client on Windows (use WSL).
- Never skip `export PATH="$HOME/bin:$PATH"` in WSL commands.
- No GitHub Actions, no webhooks — commit → push → deploy manually.
