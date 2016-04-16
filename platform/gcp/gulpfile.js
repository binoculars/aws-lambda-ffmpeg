var path = require('path');
var runSequence = require('run-sequence');
var jeditor = require("gulp-json-editor");
var child_process = require('child_process');
var packageInfo = require('../../package.json');

var config;
try {
	config = require(path.join(__dirname, 'config.json'));
} catch (ex) {
	config = {};
}

module.exports = function(gulp, prefix) {
	gulp.task(prefix + ':npm', function() {
		return gulp.src('./package.json')
			.pipe(jeditor(function(json) {
				json.main = './gcp/index.js';
				json.dependencies.gcloud = packageInfo.devDependencies.gcloud;
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
				'--bucket', config.functionBucket,
				'--trigger-gs-uri', config.sourceBucket
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