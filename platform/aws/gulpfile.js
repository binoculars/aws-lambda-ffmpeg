var fs = require('fs');
var path = require('path');
var async = require('async');
var runSequence = require('run-sequence');
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var lambda = new AWS.Lambda();
var cloudFormation = new AWS.CloudFormation();
var packageInfo = require('../../package.json');

var config;
try {
	config = require(path.join(__dirname, 'config.json'));
} catch (ex) {
	config = {};
}

var bucket = config.functionBucket;
var key = packageInfo.name + '.zip';

module.exports = function(gulp, prefix) {
	// Upload the function code to S3
	gulp.task(prefix + ':upload', function (cb) {
		s3.upload({
			Bucket: bucket,
			Key: key,
			Body: fs.createReadStream('dist.zip')
		}, cb);
	});

	var stackName = packageInfo.name;

	// Deploy the CloudFormation Stack
	gulp.task(prefix + ':deployStack', function(cb) {
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
	gulp.task(prefix + ':updateCode', function(cb) {
		async.waterfall([
			function(cb) {
				cloudFormation.describeStackResource({
					StackName: stackName,
					LogicalResourceId: 'Lambda'
				}, cb);
			},
			function(data, cb) {
				lambda.updateFunctionCode({
					FunctionName: data.StackResourceDetail.PhysicalResourceId,
					S3Bucket: bucket,
					S3Key: key
				}, cb);
			}
		], cb);
	});

	// Builds the function and uploads
	gulp.task(prefix + ':build-upload', function(cb) {
		return runSequence(
			'clean',
			['download-ffmpeg', prefix + ':source', 'npm'],
			'untar-ffmpeg',
			'copy-ffmpeg',
			'zip',
			prefix + ':upload',
			cb
		);
	});

	// For an already created stack
	gulp.task(prefix + ':update', function(cb) {
		return runSequence(
			prefix + ':build-upload',
			prefix + ':updateCode',
			cb
		);
	});

	// For a new stack (or you change cloudformation.json)
	gulp.task(prefix + ':default', function(cb) {
		return runSequence(
			prefix + ':build-upload',
			prefix + ':deployStack',
			cb
		);
	});
};