'use strict';

const path = require('path');
const runSequence = require('run-sequence');
const jeditor = require("gulp-json-editor");
const child_process = require('child_process');
const packageInfo = require('../../package.json');

let config;
try {
	config = require('../../config/gcp.json');
} catch (ex) {
	config = {};
}

module.exports = function(gulp, prefix) {
	gulp.task(prefix + ':npm', function() {
		return gulp.src('./package.json')
			.pipe(jeditor(function(json) {
				json.main = './gcp/index.js';
				json.dependencies['google-cloud'] = packageInfo.devDependencies['google-cloud'];
				delete json.scripts;
				delete json.devDependencies;
				return json;
			}))
			.pipe(gulp.dest('./dist'));
	});

	// Builds the function and uploads
	gulp.task(prefix + ':build', function(cb) {
		return runSequence(
			'clean',
			['download-ffmpeg', prefix + ':source', prefix + ':npm'],
			'untar-ffmpeg',
			'copy-ffmpeg',
			cb
		);
	});
	
	gulp.task(prefix + ':deploy', function() {
		return child_process.spawnSync(
			'gcloud',
			[
				'alpha',
				'functions',
				'deploy',
				'ffmpeg',
				'--entry-point', 'entryPoint',
				'--stage-bucket', config.functionBucket,
				'--trigger-bucket', config.sourceBucket
			],
			{
				cwd: './dist',
				stdio: 'inherit'
			}
		);
	});
	
	gulp.task(prefix + ':default', function(cb) {
		return runSequence(
			prefix + ':build',
			prefix + ':deploy',
			cb
		);
	});
};
