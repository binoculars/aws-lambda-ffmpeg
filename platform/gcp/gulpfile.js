var path = require('path');
var runSequence = require('run-sequence');
var jeditor = require("gulp-json-editor");
var child_process = require('child_process');

var config;
try {
	config = require(path.join(__dirname, 'config.json'));
} catch (ex) {
	config = {};
}

module.exports = function(gulp, prefix) {
	gulp.task(prefix + ':npm', function() {
		return gulp.src('./package.json')
			.pipe(jeditor({
				"main": "./gcp/index.js",
				"dependencies": {
					"gcloud": "^0.30.2"
				}
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
	
	gulp.task(prefix + ':deploy', function(cb) {
		child_process.exec([
			'gcloud',
			'alpha', 
			'functions',
			'deploy',
			'ffmpeg',
			'--bucket', config.functionBucket,
			'--trigger-gs-uri', config.sourceBucket
		].join(' '), {cwd: './dist'}, function(error, stdout, stderr) {
			console.log(stdout);
			cb();
		});
	});
	
	gulp.task(prefix + ':default', function(cb) {
		return runSequence(
			prefix + ':build',
			prefix + ':deploy',
			cb
		);
	});
};