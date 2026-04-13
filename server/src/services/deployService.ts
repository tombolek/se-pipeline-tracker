/**
 * In-app frontend deploy service.
 *
 * Flow:
 *   1. Fetch latest commit SHA from GitHub API
 *   2. Download repo tarball for that SHA
 *   3. Extract → run `npm ci && npm run build` in client/ subdirectory
 *   4. Upload dist/ files to S3 frontend bucket
 *   5. Submit CloudFront /* invalidation
 *   6. Update deploy_log row throughout
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { query } from '../db/index.js';

const GITHUB_OWNER = 'tombolek';
const GITHUB_REPO  = 'se-pipeline-tracker';
const REGION       = process.env.AWS_REGION ?? 'eu-west-1';

let deployRunning = false;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function appendLog(logId: number, message: string): Promise<void> {
  const ts = new Date().toISOString().slice(11, 19);
  await query(
    `UPDATE deploy_log SET log = array_append(log, $1) WHERE id = $2`,
    [`[${ts}] ${message}`, logId],
  );
}

async function githubGet(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'User-Agent':   'se-pipeline-tracker',
      Accept:         'application/vnd.github.v3+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${path}`);
  return res.json();
}

export async function getLatestSha(token: string): Promise<string> {
  const data = await githubGet(
    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/master`,
    token,
  ) as { sha: string };
  return data.sha;
}

const MIME: Record<string, string> = {
  '.html':        'text/html; charset=utf-8',
  '.js':          'application/javascript',
  '.mjs':         'application/javascript',
  '.css':         'text/css',
  '.json':        'application/json',
  '.map':         'application/json',
  '.png':         'image/png',
  '.jpg':         'image/jpeg',
  '.jpeg':        'image/jpeg',
  '.svg':         'image/svg+xml',
  '.ico':         'image/x-icon',
  '.woff':        'font/woff',
  '.woff2':       'font/woff2',
  '.ttf':         'font/ttf',
  '.txt':         'text/plain',
  '.webmanifest': 'application/manifest+json',
};

function walkDir(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else results.push(full);
  }
  return results;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getVersionStatus() {
  const token      = process.env.GITHUB_TOKEN;
  const serverSha  = process.env.DEPLOY_SHA ?? null;

  // Last completed deploy (success or failed) from DB
  const lastRow = await query<{
    id: number; status: string; triggered_at: string;
    completed_at: string | null; target_sha: string | null;
  }>(
    `SELECT id, status, triggered_at, completed_at, target_sha
     FROM deploy_log ORDER BY id DESC LIMIT 1`,
  );
  const lastDeploy = lastRow.length > 0 ? lastRow[0] : null;

  // Effective current frontend SHA: latest successful deploy's target, or server SHA
  const lastSuccessRow = await query<{ target_sha: string }>(
    `SELECT target_sha FROM deploy_log WHERE status = 'success' ORDER BY id DESC LIMIT 1`,
  );
  const frontendSha = lastSuccessRow.length > 0 ? lastSuccessRow[0].target_sha : serverSha;

  if (!token) {
    return { server_sha: serverSha, frontend_sha: frontendSha, latest_sha: null, has_update: false, last_deploy: lastDeploy, error: 'GITHUB_TOKEN not configured' };
  }

  try {
    const latestSha = await getLatestSha(token);
    return {
      server_sha:   serverSha,
      frontend_sha: frontendSha,
      latest_sha:   latestSha,
      has_update:   !!latestSha && latestSha !== frontendSha,
      last_deploy:  lastDeploy,
    };
  } catch (e) {
    return { server_sha: serverSha, frontend_sha: frontendSha, latest_sha: null, has_update: false, last_deploy: lastDeploy, error: String(e) };
  }
}

export function isDeployRunning(): boolean {
  return deployRunning;
}

export async function runDeploy(logId: number): Promise<void> {
  if (deployRunning) throw new Error('A deploy is already in progress');
  deployRunning = true;

  const token          = process.env.GITHUB_TOKEN!;
  const bucket         = process.env.FRONTEND_BUCKET!;
  const distributionId = process.env.CF_DISTRIBUTION_ID!;
  const tmpDir         = `/tmp/deploy-${logId}`;

  try {
    // ── 1. Get target SHA ────────────────────────────────────────────────────
    await appendLog(logId, 'Fetching latest commit SHA from GitHub...');
    const targetSha = await getLatestSha(token);
    await query(
      `UPDATE deploy_log SET target_sha = $1, status = 'running', current_sha = $2 WHERE id = $3`,
      [targetSha, process.env.DEPLOY_SHA ?? null, logId],
    );
    await appendLog(logId, `Target: ${targetSha.slice(0, 8)}`);

    // ── 2. Download tarball ──────────────────────────────────────────────────
    await appendLog(logId, 'Downloading source tarball...');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tarPath = `${tmpDir}/source.tar.gz`;

    const tarUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/tarball/${targetSha}`;
    const tarRes = await fetch(tarUrl, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'se-pipeline-tracker' },
      redirect: 'follow',
    });
    if (!tarRes.ok) throw new Error(`Tarball download failed: HTTP ${tarRes.status}`);
    const tarBuf = await tarRes.arrayBuffer();
    fs.writeFileSync(tarPath, Buffer.from(tarBuf));
    await appendLog(logId, `Downloaded ${Math.round(tarBuf.byteLength / 1024)} KB`);

    // ── 3. Extract ───────────────────────────────────────────────────────────
    await appendLog(logId, 'Extracting...');
    const extractDir = `${tmpDir}/src`;
    fs.mkdirSync(extractDir, { recursive: true });
    execSync(`tar -xz -f "${tarPath}" -C "${extractDir}"`, { stdio: 'pipe' });

    const topLevelEntries = fs.readdirSync(extractDir);
    if (topLevelEntries.length !== 1) {
      throw new Error(`Unexpected tarball structure: [${topLevelEntries.join(', ')}]`);
    }
    const clientDir = path.join(extractDir, topLevelEntries[0], 'client');
    if (!fs.existsSync(clientDir)) throw new Error('client/ directory not found in tarball');

    // ── 4. npm ci ────────────────────────────────────────────────────────────
    await appendLog(logId, 'Installing dependencies (npm ci)...');
    // NODE_ENV must not be 'production' here — npm ci skips devDeps (tsc, vite) in prod mode
    execSync('npm ci --silent', {
      cwd: clientDir, stdio: 'pipe', timeout: 300_000,
      env: { ...process.env, NODE_ENV: 'development' },
    });
    await appendLog(logId, 'Dependencies installed.');

    // ── 5. npm run build ─────────────────────────────────────────────────────
    await appendLog(logId, 'Building frontend...');
    execSync('npm run build', {
      cwd: clientDir,
      stdio: 'pipe',
      timeout: 300_000,
      env: { ...process.env, VITE_API_URL: '/api/v1', NODE_ENV: 'production' },
    });
    const distDir = path.join(clientDir, 'dist');
    if (!fs.existsSync(distDir)) throw new Error('dist/ not found after build');
    await appendLog(logId, 'Build complete.');

    // ── 6. Upload to S3 ──────────────────────────────────────────────────────
    await appendLog(logId, 'Uploading to S3...');
    const s3    = new S3Client({ region: REGION });
    const files = walkDir(distDir);
    for (const file of files) {
      const key         = file.slice(distDir.length + 1).replace(/\\/g, '/');
      const ext         = path.extname(file).toLowerCase();
      const contentType = MIME[ext] ?? 'application/octet-stream';
      await s3.send(new PutObjectCommand({
        Bucket:      bucket,
        Key:         key,
        Body:        fs.readFileSync(file),
        ContentType: contentType,
      }));
    }
    await appendLog(logId, `Uploaded ${files.length} files.`);

    // ── 7. CloudFront invalidation ───────────────────────────────────────────
    await appendLog(logId, 'Invalidating CloudFront cache...');
    const cf = new CloudFrontClient({ region: 'us-east-1' });
    await cf.send(new CreateInvalidationCommand({
      DistributionId:    distributionId,
      InvalidationBatch: {
        CallerReference: `deploy-${logId}-${Date.now()}`,
        Paths:           { Quantity: 1, Items: ['/*'] },
      },
    }));
    await appendLog(logId, 'Cache invalidation submitted.');

    // ── 8. Mark success ──────────────────────────────────────────────────────
    await query(
      `UPDATE deploy_log SET status = 'success', completed_at = now() WHERE id = $1`,
      [logId],
    );
    await appendLog(logId, 'Deploy complete!');

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await appendLog(logId, `ERROR: ${msg}`);
    await query(
      `UPDATE deploy_log SET status = 'failed', completed_at = now(), error = $1 WHERE id = $2`,
      [msg, logId],
    );
  } finally {
    deployRunning = false;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
