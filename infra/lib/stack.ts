import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class SePipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── 1. VPC ─────────────────────────────────────────────────────────────────
    // Single public subnet, no NAT gateway (saves ~€30/mo).
    // EC2 lives in the public subnet with an Elastic IP.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ── 2. Security group ──────────────────────────────────────────────────────
    const sg = new ec2.SecurityGroup(this, 'AppSg', {
      vpc,
      description: 'SE Pipeline Tracker app server',
      allowAllOutbound: true,
    });
    // SSH — lock this down to your office/home IP later if desired
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');
    // API — CloudFront proxies /api/* to this port
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3001), 'API');

    // ── 3. S3: DB backups ──────────────────────────────────────────────────────
    const backupBucket = new s3.Bucket(this, 'BackupBucket', {
      bucketName: `se-pipeline-backups-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        // Keep 30 days of daily backups — roughly a few MB each, < $0.01/mo
        { expiration: cdk.Duration.days(30) },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN, // never deleted by CDK
    });

    // ── 4. S3: Frontend static files ──────────────────────────────────────────
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ── 5. IAM role for EC2 ────────────────────────────────────────────────────
    const role = new iam.Role(this, 'Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        // Allows AWS Systems Manager Session Manager (SSH-free console access)
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    backupBucket.grantWrite(role);

    // ── 6. SSH key pair ────────────────────────────────────────────────────────
    // CDK creates the key pair and stores the private key in SSM Parameter Store
    // at /ec2/keypair/{keyPairId}. Retrieve with:
    //   aws ssm get-parameter --name /ec2/keypair/<id> --with-decryption
    const keyPair = new ec2.KeyPair(this, 'KeyPair', {
      keyPairName: 'se-pipeline-key',
      type: ec2.KeyPairType.RSA,
      format: ec2.KeyPairFormat.PEM,
    });

    // ── 7. EC2 user data ───────────────────────────────────────────────────────
    // Runs once on first boot: installs Docker + Compose, creates /app directory,
    // sets up the nightly backup cron (script placed by deploy.sh).
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -ex',
      // System update
      'dnf update -y',
      // Docker
      'dnf install -y docker',
      'systemctl enable docker',
      'systemctl start docker',
      'usermod -aG docker ec2-user',
      // Docker Compose v2 plugin (aarch64 / ARM64 for t4g)
      'mkdir -p /usr/lib/docker/cli-plugins',
      'ARCH=$(uname -m)',
      'curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-${ARCH}" -o /usr/lib/docker/cli-plugins/docker-compose',
      'chmod +x /usr/lib/docker/cli-plugins/docker-compose',
      // App working directory
      'mkdir -p /app/scripts',
      'chown -R ec2-user:ec2-user /app',
      // Nightly pg_dump → S3 at 02:00 UTC
      // /app/.env.prod and /app/scripts/backup.sh are created by deploy.sh
      'echo \'0 2 * * * ec2-user bash -c "set -a; source /app/.env.prod; set +a; /app/scripts/backup.sh" >> /var/log/pg-backup.log 2>&1\' > /etc/cron.d/pg-backup',
      'chmod 644 /etc/cron.d/pg-backup',
    );

    // ── 8. EC2 instance ────────────────────────────────────────────────────────
    // t4g.micro: ARM64 Graviton2, 1 GB RAM, 2 vCPU burstable — ~€5.50/mo
    // Runs both the Node.js server container and PostgreSQL container.
    const instance = new ec2.Instance(this, 'AppInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup: sg,
      role,
      keyPair,
      userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // ── 9. Elastic IP ──────────────────────────────────────────────────────────
    // Stable public IP — doesn't change on stop/start.
    // Free while associated with a running instance (~$0.005/hr if unattached).
    const eip = new ec2.CfnEIP(this, 'Eip', {
      instanceId: instance.instanceId,
    });

    // ── 10. CloudFront distribution ────────────────────────────────────────────
    // CloudFront requires a domain name for origins — raw IPs are rejected.
    // AWS automatically creates a public DNS for every EIP in the format:
    //   ec2-{dashed-ip}.{region}.compute.amazonaws.com
    // We construct it from the EIP using CloudFormation intrinsic functions.
    const ec2OriginDomain = cdk.Fn.join('', [
      'ec2-',
      cdk.Fn.join('-', cdk.Fn.split('.', eip.ref)),
      `.${this.region}.compute.amazonaws.com`,
    ]);

    // Two origins in one distribution:
    //   /*       → S3  (React SPA, cached)
    //   /api/*   → EC2 (Express API, not cached, all headers forwarded)
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'SE Pipeline Tracker',
      defaultRootObject: 'index.html',

      // SPA fallback: serve index.html for any 403/404 so React Router handles routing
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],

      // Default: serve from S3 with OAC (Origin Access Control)
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },

      // /api/* → EC2 on port 3001, no caching, all headers forwarded (JWT auth)
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(ec2OriginDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            httpPort: 3001,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });

    // ── 11. Stack outputs ──────────────────────────────────────────────────────
    // deploy.sh reads these to know where to SSH and which buckets to use.
    new cdk.CfnOutput(this, 'AppUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront app URL — open this in your browser',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution ID (used for cache invalidation on deploy)',
    });
    new cdk.CfnOutput(this, 'InstanceIp', {
      value: eip.ref,
      description: 'EC2 Elastic IP — used for SSH and server deploys',
    });
    new cdk.CfnOutput(this, 'KeyPairId', {
      value: keyPair.keyPairId,
      description: 'Key pair ID — retrieve private key: aws ssm get-parameter --name /ec2/keypair/<id> --with-decryption',
    });
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      description: 'S3 bucket for React static files',
    });
    new cdk.CfnOutput(this, 'BackupBucketName', {
      value: backupBucket.bucketName,
      description: 'S3 bucket for nightly pg_dump backups',
    });
  }
}
