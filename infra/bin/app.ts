#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SePipelineStack } from '../lib/stack';

const app = new cdk.App();

new SePipelineStack(app, 'SePipelineStack', {
  // Uses the account + region from your active AWS CLI profile.
  // Override by setting CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION env vars.
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: 'SE Pipeline Tracker — EC2 + S3 + CloudFront',
});
