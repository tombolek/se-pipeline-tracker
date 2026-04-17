# Cloud Migration Path

Because everything runs in Docker Compose, cloud migration is a container lift-and-shift. No code changes — only infra.

**AWS** (current target): RDS for PostgreSQL → ECS Fargate for backend → S3 + CloudFront for frontend → Secrets Manager for env vars.

**Azure** (alternative): Azure Database for PostgreSQL → Azure Container Apps → Azure Static Web Apps → Key Vault for env vars.

The live deployment runs on AWS via CDK — see [deploy.md](deploy.md) and `infra/lib/stack.ts`.
