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

const bucket = config.functionBucket;
const key = `${packageInfo.name}.zip`;

module.exports = function(gulp, prefix) {
	// Upload the function code to S3
	gulp.task(`${prefix}:upload`, () => {
		return s3.upload({
			Bucket: bucket,
			Key: key,
			Body: fs.createReadStream('dist.zip')
		}).promise();
	});

	const stackName = packageInfo.name;

	// Deploy the CloudFormation Stack
	gulp.task(`${prefix}:deployStack`, cb => {
		cloudFormation.describeStacks({
			StackName: stackName
		}, function(err) {
			var operation = err ? 'createStack' : 'updateStack';

			cloudFormation[operation]({
				StackName: stackName,
				Capabilities: [
					'CAPABILITY_IAM'
				],
				Parameters: [
					{
						ParameterKey: 'SourceBucketName',
						ParameterValue: config.sourceBucket
					},
					{
						ParameterKey: 'DestinationBucketName',
						ParameterValue: config.destinationBucket
					},
					{
						ParameterKey: 'LambdaS3Bucket',
						ParameterValue: bucket
					},
					{
						ParameterKey: 'LambdaS3Key',
						ParameterValue: key
					}
				],
				TemplateBody: fs.readFileSync(path.join(__dirname, 'cloudformation.json'), {encoding: 'utf8'})
			}, cb);
		});
	});

	// Once the stack is deployed, this will update the function if the code is changed without recreating the stack
	gulp.task(`${prefix}:updateCode`, () => {
		return cloudFormation
			.describeStackResource({
				StackName: stackName,
				LogicalResourceId: 'Lambda'
			}).promise()
			.then(lambda.updateFunctionCode({
				FunctionName: data.StackResourceDetail.PhysicalResourceId,
				S3Bucket: bucket,
				S3Key: key
			}).promise());
	});

	// Builds the function and uploads
	gulp.task(`${prefix}:build-upload`, cb => {
		return runSequence(
			'clean',
			['download-ffmpeg', `${prefix}:source`, 'npm'],
			'untar-ffmpeg',
			'copy-ffmpeg',
			'zip',
			`${prefix}:upload`,
			cb
		);
	});

	// For an already created stack
	gulp.task(`${prefix}:update`, cb => {
		return runSequence(
			`${prefix}:build-upload`,
			`${prefix}:updateCode`,
			cb
		);
	});

	// For a new stack (or you change cloudformation.json)
	gulp.task(`${prefix}:default`, cb => {
		return runSequence(
			`${prefix}:build-upload`,
			`${prefix}:deployStack`,
			cb
		);
	});
};