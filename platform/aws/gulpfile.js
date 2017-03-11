'use strict';

const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const runSequence = require('run-sequence');
const chalk = require('chalk');
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
const sourceBucket = process.env.CI ? `${StackName}-src` : config.sourceBucket;
const destinationBucket = process.env.CI ? `${StackName}-dst` : config.destinationBucket;
const now = new Date();

function getCloudFormationOperation(StackName) {
	return cloudFormation
		.describeStacks({
			StackName
		})
		.promise()
		.then(() => 'updateStack')
		.catch(() => 'createStack')
}

function pad(str, n) {
	const fillAmount = n - str.length;

	return `${str}${fillAmount > 0 ? ' '.repeat(fillAmount) : ''}`;
}

function colorizeResourceStatus(status) {
	if (/(FAILED|ROLLBACK)/.test(status))
		return chalk.red(status);
	else if (/IN_PROGRESS\s*$/.test(status))
		return chalk.yellow(status);
	else if (/COMPLETE\s*$/.test(status))
		return chalk.green(status);

	return status;
}

function stackEventToRow(stackEvent) {
	const mid = [
		pad(stackEvent.Timestamp, 39),
		colorizeResourceStatus(pad(stackEvent.ResourceStatus, 44)),
		pad(stackEvent.ResourceType, 26),
		pad(stackEvent.LogicalResourceId, 40 > StackName.length ? 40 : StackName.length)
	].join(' │ ');

	return `│ ${mid} │`
}

function printEventsAndWaitFor(condition, StackName) {
	let lastEvent;

	const columns = [
		41,
		46,
		28,
		42 > StackName.length ? 42 : StackName.length + 2
	];

	const columnChars = columns.map(n => '─'.repeat(n));
	const tableTopBorder = `┌${columnChars.join('┬')}┐`;
	const tableBottomBorder = `└${columnChars.join('┴')}┘`;
	const tableDivider = `├${columnChars.join('┼')}┤`;

	const head = [
		tableTopBorder,
		stackEventToRow({
			Timestamp: 'Timestamp',
			ResourceStatus: 'Status',
			ResourceType: 'Type',
			LogicalResourceId: 'Logical Id'
		}),
		tableDivider
	].join('\n');

	console.log(head);

	// Print the stack events while we're waiting for the stack to complete
	const interval = setInterval(
		() => cloudFormation
			.describeStackEvents({
				StackName
			})
			.promise()
			.then(data => {
				const newEvents = [];

				for (const stackEvent of data.StackEvents) {
					if (stackEvent.EventId === lastEvent || stackEvent.Timestamp < now)
						break;

					newEvents.unshift(stackEvent);
				}

				for (const stackEvent of newEvents) {
					console.log(
						stackEventToRow(stackEvent)
					);
				}

				// Timeout of 15 minutes
				if (new Date() - now > 9e5)
					process.exit(1);

				const firstItem = data.StackEvents[0];

				if (firstItem)
					lastEvent = firstItem.EventId;
			}),
		5e3 // 5 seconds
	);

	return cloudFormation
		.waitFor(condition, {
			StackName
		})
		.promise()
		.then(() => {
			clearInterval(interval);
			console.log(tableBottomBorder);
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
				ParameterValue: process.env.EXECUTION_ROLE_ARN
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
			.then(condition => printEventsAndWaitFor(condition, StackName))
			.catch(console.error);
	});

	gulp.task(`${prefix}:deleteStack`, () => {
		return cloudFormation
			.deleteStack({
				StackName,
				RoleARN: process.env.CLOUDFORMATION_ROLE_ARN || undefined,
			})
			.promise()
			.then(() => printEventsAndWaitFor('stackDeleteComplete', StackName))
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
				S3Key: lambdaKey
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
			['Bucket', 'S3_BUCKET']
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
						for (const remote of remotes) {
							const url = remote.refs.fetch;

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
			.then(results => {
				const operation = results[0];
				const ParameterValue = results[1];

				return cloudFormation[operation]({
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
						.then(() => operation === 'createStack' ? 'stackCreateComplete' : 'stackUpdateComplete')
				}
			)
			.then(condition => printEventsAndWaitFor(condition, StackName))
			.catch(console.error)
			.then(() => cloudFormation
				.describeStacks({
					StackName
				})
				.promise()
			)
			.then(data => console.log(
				data.Stacks[0]
					.Outputs
					.map(output => `${outputEnvMap.get(output.OutputKey)}=${output.OutputValue}`)
					.join('\n')
			))
	});
};
