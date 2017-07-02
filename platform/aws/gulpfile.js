'use strict';

const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const runSequence = require('run-sequence');
const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const lambda = new AWS.Lambda();
const cloudFormation = new AWS.CloudFormation();
const packageInfo = require('../../package.json');
const lib = require('./gulp-lib');

const {
	CFN_S3_BUCKET: Bucket,
	CFN_S3_PREFIX,
	STACK_NAME,
	SOURCE_BUCKET,
	DESTINATION_BUCKET,
	FFMPEG_ARGS,
	USE_GZIP,
	MIME_TYPES,
	VIDEO_MAX_DURATION,
	EXECUTION_ROLE_ARN,
	CI,
	CLOUDFORMATION_ROLE_ARN,
} = process.env;

const s3Prefix = CFN_S3_PREFIX || packageInfo.name;
const templateKey = `${s3Prefix}/cloudformation.template`;
const lambdaKey = `${s3Prefix}/lambda.zip`;
const StackName = STACK_NAME || packageInfo.name;
const now = new Date();

function getCloudFormationOperation(StackName) {
	return cloudFormation
		.describeStacks({
			StackName
		})
		.promise()
		.then(() => 'updateStack')
		.catch(() => 'createStack');
}

function printEventsAndWaitFor(condition, StackName) {
	let lastEvent;

	// Print the stack events while we're waiting for the stack to complete
	const interval = setInterval(
		() => cloudFormation
			.describeStackEvents({
				StackName
			})
			.promise()
			.then(({StackEvents}) => {
				const newEvents = [];

				for (const stackEvent of StackEvents) {
					if (stackEvent.EventId === lastEvent || stackEvent.Timestamp < now)
						break;

					newEvents.unshift(stackEvent);
				}

				for (const stackEvent of newEvents) {
					console.log(
						lib.stackEventToRow(stackEvent)
					);
				}

				// Timeout of 15 minutes
				if (new Date() - now > 9e5)
					process.exit(1);

				const [firstItem] = StackEvents;

				if (firstItem)
					lastEvent = firstItem.EventId;
			})
			.catch(() => clearInterval(interval)),
		5e3 // 5 seconds
	);

	console.log(lib.head);

	return cloudFormation
		.waitFor(condition, {
			StackName
		})
		.promise()
		.then(() => {
			clearInterval(interval);
			console.log(lib.table.borderBottom);
		});
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
		].map(({Key, file}) => s3
			.putObject({
				Bucket,
				Key,
				Body: fs.createReadStream(file)
			})
			.promise()
		))
	);


	// Deploy the CloudFormation Stack
	gulp.task(`${prefix}:deployStack`, () => {
		const Parameters = [
			['SourceBucketName', SOURCE_BUCKET],
			['DestinationBucketName', DESTINATION_BUCKET],
			['LambdaS3Bucket', Bucket],
			['LambdaS3Key', lambdaKey],
			['FFmpegArgs', FFMPEG_ARGS],
			['UseGzip', USE_GZIP],
			['MimeTypes', MIME_TYPES],
			['VideoMaxDuration', VIDEO_MAX_DURATION],
			CI ? ['ExecutionRoleManagedPolicyArn', EXECUTION_ROLE_ARN] : undefined
		]
			.filter(val => val)
			.map(([ParameterKey, ParameterValue]) => ({ParameterKey, ParameterValue}));

		return getCloudFormationOperation(StackName)
			.then(operation => cloudFormation
				[operation]({
					StackName,
					Capabilities: [
						'CAPABILITY_IAM'
					],
					Parameters,
					RoleARN: CLOUDFORMATION_ROLE_ARN || undefined,
					TemplateURL: `https://s3.amazonaws.com/${Bucket}/${templateKey}`
				})
				.promise()
				.then(() => `stack${operation === 'createStack' ? 'Create' : 'Update'}Complete`)
			)
			.then(condition => printEventsAndWaitFor(condition, StackName))
			.catch(console.error);
	});

	gulp.task(`${prefix}:deleteStack`, () => cloudFormation
		.deleteStack({
			StackName,
			RoleARN: CLOUDFORMATION_ROLE_ARN || undefined,
		})
		.promise()
		.then(() => printEventsAndWaitFor('stackDeleteComplete', StackName))
	);

	// Once the stack is deployed, this will update the function if the code is changed without recreating the stack
	gulp.task(`${prefix}:updateCode`, () => cloudFormation
		.describeStackResource({
			StackName,
			LogicalResourceId: 'Lambda'
		})
		.promise()
		.then(({StackResourceDetail: {PhysicalResourceId: FunctionName}}) => lambda
			.updateFunctionCode({
				FunctionName,
				S3Bucket: Bucket,
				S3Key: lambdaKey
			})
			.promise()
		)
	);

	// Builds the function and uploads
	gulp.task(`${prefix}:build-upload`, () => runSequence(
		'clean',
		'download-ffmpeg',
		`${prefix}:source`,
		'npm',
		'untar-ffmpeg',
		'copy-ffmpeg',
		'zip',
		`${prefix}:upload`
	));

	// For an already created stack
	gulp.task(`${prefix}:update`, () => runSequence(
		`${prefix}:build-upload`,
		`${prefix}:updateCode`
	));

	// For a new stack (or you change cloudformation.json)
	gulp.task(`${prefix}:default`, () => runSequence(
		`${prefix}:build-upload`,
		`${prefix}:deployStack`
	));

	const ciStackName = `CI-for-${StackName}`;

	gulp.task(`${prefix}:ci-bootstrap`, () => {
		const StackName = ciStackName;
		const simpleGit = require('simple-git')();

		const outputEnvMap = new Map([
			['CIUserAccessKey', 'AWS_ACCESS_KEY_ID'],
			['CIUserSecretKey', 'AWS_SECRET_ACCESS_KEY'],
			['CIRegion', 'AWS_REGION'],
			['ServiceRoleArn', 'CLOUDFORMATION_ROLE_ARN'],
			['ModulePolicyArn', 'EXECUTION_ROLE_ARN'],
			['Bucket', 'CFN_S3_BUCKET']
		]);

		return Promise
			.all([
				getCloudFormationOperation(StackName),
				new Promise((resolve, reject) =>
					simpleGit.getRemotes(
						true,
						(err, data) => err ? reject(err) : resolve(data)
					)
				)
					.then(remotes => {
						for (const {refs: {fetch: url}} of remotes) {
							// Use GitHub user and repo name for StackPrefix
							if (/github\.com/.test(url)) {
								return url
									.replace(/^.*github.com[:/]/, '')
									.replace(/\.git$/, '')
									.replace(/\//g, '-');
							}
						}

						return packageInfo.name;
					})
		])
			.then(([operation, ParameterValue]) => cloudFormation[operation]({
						StackName,
						Capabilities: [
							'CAPABILITY_NAMED_IAM'
						],
						Parameters: [
							{
								ParameterKey: 'StackPrefix',
								ParameterValue,
							}
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
						.then(() => `stack${operation === 'createStack' ? 'Create' : 'Update'}Complete`)
			)
			.then(condition => printEventsAndWaitFor(condition, StackName))
			.catch(console.error)
			.then(() => cloudFormation
				.describeStacks({
					StackName
				})
				.promise()
			)
			.then(({Stacks: [{Outputs}]}) => console.log(
				Outputs
					.map(({OutputKey, OutputValue}) => `${outputEnvMap.get(OutputKey)}=${OutputValue}`)
					.join('\n')
			))
	});

	gulp.task(`${prefix}:create-cfn-bucket`, () => s3
		.createBucket({
			Bucket
		})
		.promise()
		.catch(console.error)
	);
};
