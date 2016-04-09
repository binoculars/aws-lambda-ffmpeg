var http = require('http');
var fs = require('fs');
var path = require('path');
var gulp = require('gulp');
var shell = require('gulp-shell');
var flatten = require('gulp-flatten');
var rename = require('gulp-rename');
var del = require('del');
var install = require('gulp-install');
var zip = require('gulp-zip');
var async = require('async');

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

gulp.task('download-ffmpeg', function(cb) {
	if(!fs.existsSync('./build')) {
		fs.mkdirSync('./build');
	}

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
gulp.task('clean', function() {
	return del([
		'./build/*',
		'./dist/*',
		'./dist.zip'
	]);
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

[
	'aws',
	'gcp'
].forEach(function(platform) {
	gulp.task(platform + ':source', function() {
		var files = [
			'common.js',
			platform + '/index.js',
			platform + '/lib.js',
			platform + '/config.json',
			platform + '/keyfile.json'
		];
		var baseDir = 'platform';
		var options = {
			base: baseDir,
			cwd: baseDir
		};

		return gulp.src(files, options)
			.pipe(gulp.dest('dist'));
	});

	require(path.join(__dirname, 'platform', platform, 'gulpfile.js'))(gulp, platform);
});