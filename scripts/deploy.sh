#!/bin/bash
# Deploy SE Pipeline Tracker to AWS
#
# Usage:
#   ./scripts/deploy.sh                   # full deploy (frontend + server)
#   ./scripts/deploy.sh --frontend-only   # rebuild and re-upload React app only
#   ./scripts/deploy.sh --server-only     # rsync + rebuild server only
#
# Prerequisites:
#   1. AWS CLI configured (aws sts get-caller-identity should succeed)
#   2. CDK stack already deployed (cd infra && npm ci && npx cdk deploy)
#   3. .env.prod.local exists in the repo root with production secrets
#      (copy .env.example, fill in real values, never commit this file)

set -euo pipefail

STACK_NAME="SePipelineStack"
REGION="${AWS_DEFAULT_REGION:-eu-west-1}"
KEY_FILE="$HOME/.ssh/se-pipeline.pem"
ENV_FILE="${ENV_FILE:-.env.prod.local}"

# ── Parse flags ───────────────────────────────────────────────────────────────
DEPLOY_FRONTEND=true
DEPLOY_SERVER=true
for arg in "$@"; do
  case $arg in
    --frontend-only) DEPLOY_SERVER=false ;;
    --server-only)   DEPLOY_FRONTEND=false ;;
  esac
done

# ── Read CloudFormation outputs ───────────────────────────────────────────────
echo "=== Reading stack outputs ==="
get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text | tr -d '\r'
}

INSTANCE_IP=$(get_output InstanceIp)
KEY_PAIR_ID=$(get_output KeyPairId)
FRONTEND_BUCKET=$(get_output FrontendBucketName)
BACKUP_BUCKET=$(get_output BackupBucketName)
APP_BACKUP_BUCKET=$(get_output AppBackupBucketName)
DISTRIBUTION_ID=$(get_output DistributionId)
APP_URL=$(get_output AppUrl)

echo "  EC2 IP:  $INSTANCE_IP"
echo "  App URL: $APP_URL"

# ── SSH key ───────────────────────────────────────────────────────────────────
if [ ! -f "$KEY_FILE" ]; then
  echo "=== Downloading SSH key from SSM ==="
  aws ssm get-parameter \
    --name "/ec2/keypair/$KEY_PAIR_ID" \
    --with-decryption \
    --query Parameter.Value \
    --output text \
    --region "$REGION" > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  echo "  Saved to $KEY_FILE"
fi

SSH_CMD="ssh -i $KEY_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=10"
SSH="$SSH_CMD ec2-user@$INSTANCE_IP"

# ── Wait for EC2 to be reachable (only needed when deploying server) ──────────
if [ "$DEPLOY_SERVER" = true ]; then
  echo "=== Verifying EC2 SSH connectivity ==="
  RETRIES=12
  until $SSH "docker --version" > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
      echo "ERROR: Could not reach EC2. Is Docker installed? Check user-data logs:"
      echo "  ssh -i $KEY_FILE ec2-user@$INSTANCE_IP 'sudo cat /var/log/cloud-init-output.log'"
      exit 1
    fi
    echo "  Waiting for EC2... ($RETRIES retries left)"
    sleep 15
  done
  echo "  EC2 is reachable"
fi

# ── Production env file ───────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "ERROR: $ENV_FILE not found."
  echo "Create it by copying .env.example and filling in production values:"
  echo "  cp .env.example .env.prod.local"
  echo "  # Edit .env.prod.local — never commit this file"
  exit 1
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
if [ "$DEPLOY_FRONTEND" = true ]; then
  echo "=== Syncing client source to EC2 ==="
  $SSH "rm -rf /app/client && mkdir -p /app/client"
  scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r \
    client/src client/public client/index.html client/package.json client/package-lock.json \
    client/tsconfig.json client/tsconfig.app.json client/tsconfig.node.json \
    client/vite.config.ts client/tailwind.config.ts client/postcss.config.js \
    ec2-user@$INSTANCE_IP:/app/client/
  # Copy production env (sets VITE_API_URL=/api/v1)
  if [ -f client/.env.production ]; then
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
      client/.env.production ec2-user@$INSTANCE_IP:/app/client/.env.production
  fi

  echo "=== Building frontend on EC2 (Docker) ==="
  $SSH "docker run --rm -v /app/client:/app -w /app node:20-alpine \
    sh -c 'npm ci --silent && npm run build'"

  echo "=== Uploading frontend to S3 ==="
  $SSH "aws s3 sync /app/client/dist/ s3://$FRONTEND_BUCKET/ --delete --region $REGION"

  echo "=== Invalidating CloudFront cache ==="
  aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --paths "/*" \
    --region us-east-1 > /dev/null
  echo "  Cache invalidation submitted"
fi

# ── Server ────────────────────────────────────────────────────────────────────
if [ "$DEPLOY_SERVER" = true ]; then
  echo "=== Syncing server source to EC2 ==="
  # Clear old server src on remote, then copy fresh (scp -r, no rsync available on Windows)
  $SSH "rm -rf /app/server && mkdir -p /app/server"
  scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r \
    server/src server/migrations server/package.json server/package-lock.json server/tsconfig.json server/Dockerfile \
    ec2-user@$INSTANCE_IP:/app/server/

  echo "=== Syncing compose file and scripts to EC2 ==="
  scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
    docker-compose.prod.yml ec2-user@$INSTANCE_IP:/app/
  $SSH "mkdir -p /app/scripts"
  scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
    scripts/backup.sh ec2-user@$INSTANCE_IP:/app/scripts/
  $SSH "chmod +x /app/scripts/*.sh"

  echo "=== Uploading .env.prod to EC2 ==="
  scp -i "$KEY_FILE" -o StrictHostKeyChecking=no \
    "$ENV_FILE" ec2-user@$INSTANCE_IP:/app/.env.prod
  # Append the backup bucket name (comes from CDK outputs, not .env.prod.local)
  $SSH "grep -q '^BACKUP_BUCKET=' /app/.env.prod && \
        sed -i 's|^BACKUP_BUCKET=.*|BACKUP_BUCKET=$BACKUP_BUCKET|' /app/.env.prod || \
        echo 'BACKUP_BUCKET=$BACKUP_BUCKET' >> /app/.env.prod"
  $SSH "grep -q '^APP_BACKUP_BUCKET=' /app/.env.prod && \
        sed -i 's|^APP_BACKUP_BUCKET=.*|APP_BACKUP_BUCKET=$APP_BACKUP_BUCKET|' /app/.env.prod || \
        echo 'APP_BACKUP_BUCKET=$APP_BACKUP_BUCKET' >> /app/.env.prod"
  $SSH "chmod 600 /app/.env.prod"

  echo "=== Building server Docker image on EC2 ==="
  $SSH "cd /app && docker compose -f docker-compose.prod.yml --env-file .env.prod build server"

  echo "=== Starting containers ==="
  $SSH "cd /app && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d"

  echo "=== Waiting for containers to be healthy ==="
  sleep 8
  $SSH "cd /app && docker compose -f docker-compose.prod.yml ps"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "✓ Deployment complete!"
echo "  $APP_URL"
