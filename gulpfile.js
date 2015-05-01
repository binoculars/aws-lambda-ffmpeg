var http = require('http');
var fs = require('fs');

var gulp = require('gulp');
var shell = require('gulp-shell');
var flatten = require('gulp-flatten');
var gutil = require('gulp-util');
var del = require('del');
var rename = require('gulp-rename');
var install = require('gulp-install');
var zip = require('gulp-zip');
var AWS = require('aws-sdk');
var runSequence = require('run-sequence');

var filename = './build/ffmpeg-git-64bit-static.tar.xz';

gulp.task('download-ffmpeg', function(cb) {
	var file = fs.createWriteStream(filename);
	http.get('http://johnvansickle.com/ffmpeg/builds/ffmpeg-git-64bit-static.tar.xz', function(response) {
		response.pipe(file);

		file.on('finish', function() {
			file.close();
			cb();
		})
	});
});

gulp.task('untar-ffmpeg', shell.task([
	'tar -xvf ' + filename + ' -C ./build'
]));

// This is still buggy
gulp.task('copy-ffmpeg', ['download-ffmpeg', 'untar-ffmpeg'], function() {
	gulp.src('build/ffmpeg-*/ffmpeg')
		.pipe(flatten())
		.pipe(gulp.dest('./dist'));
});

/*
 From: https://medium.com/@AdamRNeary/a-gulp-workflow-for-amazon-lambda-61c2afd723b6
 */

// First we need to clean out the dist folder and remove the compiled zip file.
gulp.task('clean', function(cb) {
	//del('./build/*');
	del('./dist',
		del('./dist.zip', cb)
	);

});

// The js task could be replaced with gulp-coffee as desired.
gulp.task('js', function() {
	gulp.src(['index.js', 'config.json'])
		.pipe(gulp.dest('dist/'))
});

// Here we want to install npm packages to dist, ignoring devDependencies.
gulp.task('npm', function() {
	gulp.src('./package.json')
		.pipe(gulp.dest('./dist/'))
		.pipe(install({production: true}));
});

// Next copy over environment variables managed outside of source control.
gulp.task('env', function() {
	gulp.src('./config.env.production')
		.pipe(rename('.env'))
		.pipe(gulp.dest('./dist'))
});

// Now the dist directory is ready to go. Zip it.
gulp.task('zip', function() {
	gulp.src(['dist/**/*', '!dist/package.json', 'dist/.*'])
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
gulp.task('upload', function() {
	AWS.config.region = 'us-east-1';
	var lambda = new AWS.Lambda();
	var functionName = require('./package.json').name;

	lambda.getFunction({FunctionName: functionName}, function(err, data) {
		if (err) {
			var warning;

			if (err.statusCode === 404) {
				warning = 'Unable to find lambda function ' + deploy_function
				+ '. Verify the lambda function name and AWS region are correct.';
			} else {
				warning = 'AWS API request failed. Check your AWS credentials and permissions.';
			}

			gutil.log(warning);
		}

		// This is a bit silly, simply because these five parameters are required.
		var current = data.Configuration;
		var params = {
			FunctionName: functionName,
			Handler: current.Handler,
			Mode: current.Mode,
			Role: current.Role,
			Runtime: current.Runtime
		};

		fs.readFile('./dist.zip', function(err, data) {
			params['FunctionZip'] = data;
			lambda.uploadFunction(params, function(err, data) {
				if (err) {
					var warning = 'Package upload failed. ';
					warning += 'Check your iam:PassRole permissions.';
					gutil.log(warning);
				}
			});
		});
	});
});

gulp.task('default', function(callback) {
	return runSequence(
		['clean'],
		['copy-ffmpeg'],
		['js', 'npm', 'env'],
		['zip'],
		//['upload'],
		callback
	);
});