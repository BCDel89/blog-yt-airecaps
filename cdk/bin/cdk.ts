#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AiRecapsBlogStack } from '../lib/ai-recaps-blog-stack';

const app = new cdk.App();
new AiRecapsBlogStack(app, 'AiRecapsBlogStack', {
  env: {
    account: '273500459613',
    region: 'us-east-1',
  },
});
