'use strict';

const fs = require('fs');
const path = require('path');
const runSequence = require('run-sequence');
const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const cloudFormation = new AWS.CloudFormation();
const packageInfo = require('../../package.json');

let config = {};
try {
	config = require('../../config/aws.json');
} catch (ex) {
	config = {};
}

const Bucket = process.env.S3_BUCKET || config.functionBucket;
const s3Prefix = process.env.S3_PREFIX || packageInfo.name;
const templateKey = `${s3Prefix}/cloudformation.template`;
const lambdaKey = `${s3Prefix}/lambda.zip`;
const StackName = process.env.STACK_NAME || packageInfo.name;

function getCloudFormationOperation(StackName) {
	return cloudFormation
		.describeStacks({
			StackName
		})
		.promise()
		.then(() => 'updateStack')
		.catch(() => 'createStack')
}

module.exports = function(gulp, prefix) {
	// Upload the function code to S3
	gulp.task(`${prefix}:upload`, () => Promise
		.all([
			{
				Key: templateKey,
				file: './platform/aws/cloudformation.json'
			},
			{
				Key: lambdaKey,
				file: 'dist.zip'
			}
		].map(obj => s3
			.putObject({
				Bucket,
				Key: obj.Key,
				Body: fs.createReadStream(obj.file)
			})
			.promise()
		))
	);

	// Deploy the CloudFormation Stack
	gulp.task(`${prefix}:deployStack`, () => {
		const sourceBucket = process.env.CI ? `${StackName}-src` : config.sourceBucket;
		const destinationBucket = process.env.CI ? `${StackName}-dst` : config.destinationBucket;

		const Parameters = [
			{
				ParameterKey: 'SourceBucketName',
				ParameterValue: sourceBucket
			},
			{
				ParameterKey: 'DestinationBucketName',
				ParameterValue: destinationBucket
			},
			{
				ParameterKey: 'LambdaS3Bucket',
				ParameterValue: Bucket
			},
			{
				ParameterKey: 'LambdaS3Key',
				ParameterValue: lambdaKey
			}
		];

		if (process.env.CI)
			Parameters.push({
				ParameterKey: 'ExecutionRoleManagedPolicyArn',
				ParameterValue: process.env.ExecutionRoleManagedPolicyArn
			});

		return getCloudFormationOperation(StackName)
			.then(operation => cloudFormation
				[operation]({
					StackName,
					Capabilities: [
						'CAPABILITY_IAM'
					],
					Parameters,
					RoleARN: process.env.CLOUDFORMATION_ROLE_ARN || undefined,
					TemplateURL: `https://s3.amazonaws.com/${Bucket}/${templateKey}`
				})
				.promise()
				.then(() => operation === 'createStack' ? 'stackCreateComplete' : 'stackUpdateComplete')
			)
			.then(condition => {
				let lastEvent;

				const interval = setInterval(() => cloudFormation
					.describeStackEvents({
						StackName
					})
					.promise()
					.then(data => {
						const newEvents = [];

						for (const stackEvent of data.StackEvents) {
							if (stackEvent.EventId === lastEvent)
								break;

							newEvents.unshift(stackEvent);
						}

						for (const stackEvent of newEvents) {
							console.log(
								[
									stackEvent.Timestamp,
									stackEvent.ResourceStatus,
									stackEvent.ResourceType,
									stackEvent.LogicalResourceId
								].join('\t\t')
							);
						}

						const firstItem = data.StackEvents[0];

						if (firstItem)
							lastEvent = firstItem.EventId;
					}),
				5e3);

				return cloudFormation
					.waitFor(condition, {
						StackName
					})
					.promise()
					.then(() => clearInterval(interval));
				}
			)
			.catch(console.error);
	});

	gulp.task(`${prefix}:deleteStack`, () => {
		return cloudFormation
			.deleteStack({
				StackName,
				RoleARN: process.env.CLOUDFORMATION_ROLE_ARN || undefined,
			})
			.promise()
	});

	// Once the stack is deployed, this will update the function if the code is changed without recreating the stack
	gulp.task(`${prefix}:updateCode`, () => cloudFormation
		.describeStackResource({
			StackName,
			LogicalResourceId: 'Lambda'
		})
		.promise()
		.then(data => lambda
			.updateFunctionCode({
				FunctionName: data.StackResourceDetail.PhysicalResourceId,
				S3Bucket: Bucket,
				S3Key: Key
			})
			.promise()
		)
	);

	// Builds the function and uploads
	gulp.task(`${prefix}:build-upload`, cb => runSequence(
		'clean',
		['download-ffmpeg', `${prefix}:source`, 'npm'],
		'untar-ffmpeg',
		'copy-ffmpeg',
		'zip',
		`${prefix}:upload`,
		cb
	));

	// For an already created stack
	gulp.task(`${prefix}:update`, cb => runSequence(
		`${prefix}:build-upload`,
		`${prefix}:updateCode`,
		cb
	));

	// For a new stack (or you change cloudformation.json)
	gulp.task(`${prefix}:default`, cb => runSequence(
		`${prefix}:build-upload`,
		`${prefix}:deployStack`,
		cb
	));

	gulp.task(`${prefix}:ci-bootstrap`, () => {
		const _StackName = `CI-for-${StackName}`;

		return getCloudFormationOperation(_StackName)
			.then(operation => cloudFormation
				[operation]({
					StackName: _StackName,
					Capabilities: [
						'CAPABILITY_NAMED_IAM'
					],
					TemplateBody: fs.readFileSync(
						path.join(
							__dirname,
							'../../test/integration/aws/bootstrap.template'
						),
						{
							encoding: 'utf8'
						}
					)
				})
				.promise()
			);
	});
};
