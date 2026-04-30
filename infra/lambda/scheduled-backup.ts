/**
 * Scheduled-backup Lambda — invoked once a day by an EventBridge rule.
 *
 * The only job: POST to /api/v1/backup/run-scheduled with a shared secret
 * header. The actual backup work happens server-side. This Lambda owns no
 * DB credentials, no S3 perms, no VPC attachment — just outbound HTTPS +
 * SSM read for the secret.
 *
 * The shared secret lives in SSM (path passed via BACKUP_TRIGGER_SECRET_SSM
 * env var). We fetch it at invocation time rather than baking it into the
 * Lambda's environment configuration so a) it never appears in
 * `lambda:GetFunctionConfiguration` output, and b) rotation is just an SSM
 * update — no Lambda redeploy.
 *
 * Module-level cache keeps warm-start invocations fast; cold-start cost is
 * one SSM call (~200 ms) on a 24-hour cadence, so cost is irrelevant.
 */

import type { Handler } from 'aws-lambda';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret !== null) return cachedSecret;
  const paramName = process.env.BACKUP_TRIGGER_SECRET_SSM;
  if (!paramName) {
    throw new Error('BACKUP_TRIGGER_SECRET_SSM env var not set');
  }
  const r = await ssm.send(
    new GetParameterCommand({ Name: paramName, WithDecryption: true })
  );
  if (!r.Parameter?.Value) {
    throw new Error(`SSM parameter ${paramName} has no value (operator must run aws ssm put-parameter)`);
  }
  cachedSecret = r.Parameter.Value;
  return cachedSecret;
}

export const handler: Handler = async () => {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error('APP_URL env var not set');

  const secret = await getSecret();
  const url = `${appUrl}/api/v1/backup/run-scheduled`;
  console.log(`[scheduled-backup-lambda] POST ${url}`);

  const startedAt = Date.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Backup-Trigger-Secret': secret,
      'Content-Type': 'application/json',
    },
  });
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const body = await resp.text();

  if (!resp.ok) {
    const snippet = body.slice(0, 500);
    console.error(`[scheduled-backup-lambda] HTTP ${resp.status} after ${elapsedSec}s: ${snippet}`);
    throw new Error(`Scheduled backup failed: HTTP ${resp.status} - ${snippet.slice(0, 200)}`);
  }

  console.log(`[scheduled-backup-lambda] success in ${elapsedSec}s: ${body.slice(0, 300)}`);
  return { ok: true, status: resp.status, elapsedSec };
};
