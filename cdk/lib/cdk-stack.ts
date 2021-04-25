import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as ecr from '@aws-cdk/aws-ecr';
import * as lambda from '@aws-cdk/aws-lambda';
import * as iam from '@aws-cdk/aws-iam';
import { S3EventSource } from '@aws-cdk/aws-lambda-event-sources';

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sourceBucket = new s3.Bucket(this, 'SourceBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });
    
    const destinationBucket = new s3.Bucket(this, 'DestinationBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      accessControl: s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    const repository = new ecr.Repository(this, 'Repository', {
      imageScanOnPush: true,
    });

    const lambdaFunction = new lambda.DockerImageFunction(this, 'LambdaFunction', {
      code: lambda.DockerImageCode.fromEcr(repository),
      memorySize: 1536,
    });

    lambdaFunction.role?.attachInlinePolicy(
      new iam.Policy(this, 'GetObjectPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:GetObject'],
            resources: [
              sourceBucket.arnForObjects('*'),
            ],
          }),
        ],
      }),
    );

    lambdaFunction.role?.attachInlinePolicy(
      new iam.Policy(this, 'PutObjectPolicy', {
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['s3:PutObject'],
            resources: [
              destinationBucket.arnForObjects('*'),
            ],
          }),
        ],
      }),
    );

    lambdaFunction.addEventSource(new S3EventSource(sourceBucket, {
      events: [ s3.EventType.OBJECT_CREATED ],
    }));
  }
}
