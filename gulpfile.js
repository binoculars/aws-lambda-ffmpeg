var http = require('http');
var fs = require('fs');
var gulp = require('gulp');
var gutil = require('gulp-util');
var shell = require('gulp-shell');
var flatten = require('gulp-flatten');
var rename = require('gulp-rename');
var del = require('del');
var install = require('gulp-install');
var zip = require('gulp-zip');
var AWS = require('aws-sdk');
var runSequence = require('run-sequence');
var async = require('async');
var s3 = new AWS.S3();
var cloudformation = new AWS.CloudFormation();

var config;
try {
	config = require('./config.json');
} catch (ex) {
	config = {};
}

var filename = './build/ffmpeg-git-64bit-static.tar.xz';
var fileURL = 'http://johnvansickle.com/ffmpeg/builds/ffmpeg-git-64bit-static.tar.xz';

gulp.task('postinstall', function(cb) {
	async.reject(
		['config.json', 'test_event.json'],
		fs.exists,
		function(files) {
			async.map(files, function(file, cb) {
				return cb(null, gulp.src(file.replace(/\.json/, '_sample.json'))
						.pipe(rename(file))
						.pipe(gulp.dest('.'))
				);
			}, cb);
		}
	);
});

gulp.task('create-s3-buckets', function(cb) {
	async.map(
		[config.sourceBucket, config.destinationBucket],
		function(bucketName, cb) {
			s3.createBucket({Bucket: bucketName}, cb);
		},
		function(err, results) {
			if (err) console.log(err);
			else console.log(results);
			cb();
		}
	);
});

gulp.task('download-ffmpeg', function(cb) {
	var file = fs.createWriteStream(filename);
	http.get(fileURL, function(response) {
		response.pipe(file);

		file.on('finish', function() {
			file.close();
			cb();
		})
	});
});

// Resorting to using a shell task. Tried a number of other things including
// LZMA-native, node-xz, decompress-tarxz. None of them work very well with this.
// This will probably work well for OS X and Linux, but maybe not Windows without Cygwin.
gulp.task('untar-ffmpeg', shell.task([
	'tar -xvf ' + filename + ' -C ./build'
]));

gulp.task('copy-ffmpeg', function() {
	return gulp.src(['build/ffmpeg-*/ffmpeg', 'build/ffmpeg-*/ffprobe'])
		.pipe(flatten())
		.pipe(gulp.dest('./dist'));
});

/*
 From: https://medium.com/@AdamRNeary/a-gulp-workflow-for-amazon-lambda-61c2afd723b6
 */

// First we need to clean out the dist folder and remove the compiled zip file.
gulp.task('clean', function(cb) {
	del([
		'./build/*',
		'./dist/*',
		'./dist.zip'
	], cb);
});

// The js task could be replaced with gulp-coffee as desired.
gulp.task('js', function() {
	return gulp.src(['index.js', 'config.json'])
		.pipe(gulp.dest('./dist'))
});

// Here we want to install npm packages to dist, ignoring devDependencies.
gulp.task('npm', function() {
	return gulp.src('./package.json')
		.pipe(gulp.dest('./dist'))
		.pipe(install({production: true}));
});

// Now the dist directory is ready to go. Zip it.
gulp.task('zip', function() {
	return gulp.src(['dist/**/*', '!dist/package.json', 'dist/.*'])
		.pipe(zip('dist.zip'))
		.pipe(gulp.dest('./'));
});

// Per the gulp guidelines, we do not need a plugin for something that can be
// done easily with an existing node module. #CodeOverConfig
//
// Note: This presumes that AWS.config already has credentials. This will be
// the case if you have installed and configured the AWS CLI.
//
// See http://aws.amazon.com/sdk-for-node-js/
var lambda = new AWS.Lambda();
var iam = new AWS.IAM();
var packageInfo = require('./package.json');

gulp.task('upload', function(cb) {
	lambda.getFunction({
		FunctionName: packageInfo.name
	}, function(err, data) {
		var lambdaConfig = data ? data.Configuration || {} : {};
		var params = {
			FunctionName: lambdaConfig.FunctionName || packageInfo.name,
			Handler: lambdaConfig.Handler || 'index.handler',
			Description: packageInfo.description,
			MemorySize: 1536,
			Timeout: 30
		};

		if (err && err.statusCode === 404) {
			async.waterfall([
				function(cb) {
					if (lambdaConfig.Role) {
						params.Role = lambdaConfig.Role;
						return cb();
					} else {
						async.waterfall([
							function(cb) {
								iam.getRole({
									RoleName: packageInfo.name + '_execRole'
								}, function(err, data) {
									if (err) {
										iam.createRole({
											AssumeRolePolicyDocument: JSON.stringify({
												"Version": "2012-10-17",
												"Statement": [
													{
														"Effect": "Allow",
														"Principal": {
															"Service": "lambda.amazonaws.com"
														},
														"Action": "sts:AssumeRole"
													}
												]
											}),
											RoleName: packageInfo.name + '_execRole'
										}, cb);
									}
									else cb(null, data);
								});
							},
							function(data, cb) {
								params.Role = data.Role.Arn;
								iam.putRolePolicy({
									PolicyDocument: JSON.stringify({
										"Version": "2012-10-17",
										"Statement": [
											{
												"Effect": "Allow",
												"Action": ["logs:*"],
												"Resource": "arn:aws:logs:*:*:*"
											},
											{
												"Effect": "Allow",
												"Action": ["s3:GetObject"],
												"Resource": ["arn:aws:s3:::" + config.sourceBucket + "/*"]
											},
											{
												"Effect": "Allow",
												"Action": ["s3:PutObject"],
												"Resource": ["arn:aws:s3:::" + config.destinationBucket + "/*"]
											}
										]
									}, null, '\t'),
									PolicyName: data.Role.RoleName + '_policy',
									RoleName: data.Role.RoleName
								}, cb);
							}
						], cb);
					}
				},
				function(data, cb) {
					fs.readFile('./dist.zip', cb);
				},
				function(file, cb) {
					params.Code = {ZipFile: file};
					params.Runtime = 'nodejs';
					lambda.createFunction(params, cb);
				}
			], cb);
		} else {
			async.waterfall([
				function(cb) {
					fs.readFile('./dist.zip', cb);
				},
				function(file, cb) {
					lambda.updateFunctionCode({
						FunctionName: params.FunctionName,
						ZipFile: file
					}, cb);
				}
			], cb);
		}
	});
});

gulp.task('configure-source-bucket-events', function(cb) {
	async.waterfall([
		function(cb) {
			lambda.getFunctionConfiguration({
				FunctionName: packageInfo.name
			}, cb);
		},
		function(data, cb) {
			s3.putBucketNotificationConfiguration({
				Bucket: config.sourceBucket,
				NotificationConfiguration: {
					LambdaFunctionConfigurations: [
						{
							Events: ['s3:ObjectCreated:*'],
							LambdaFunctionArn: data.FunctionArn,
							Id: 'Process with ' + packageInfo.name
						}
					]
				}
			}, cb);
		}
	], cb);
});

gulp.task('default', function(cb) {
	return runSequence(
		['clean'],
		['download-ffmpeg'],
		['untar-ffmpeg'],
		['copy-ffmpeg', 'js', 'npm'],
		['zip'],
		['upload'],
		cb
	);
});