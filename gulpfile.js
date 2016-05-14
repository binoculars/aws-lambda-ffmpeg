'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const gulp = require('gulp');
const shell = require('gulp-shell');
const rename = require('gulp-rename');
const del = require('del');
const chmod = require('gulp-chmod');
const install = require('gulp-install');
const zip = require('gulp-zip');
const babel = require('gulp-babel');

const buildDir = 'build';
const filename = path.join(buildDir, 'ffmpeg-git-64bit-static.tar.xz');
const fileURL = 'http://johnvansickle.com/ffmpeg/builds/ffmpeg-git-64bit-static.tar.xz';

gulp.task('download-ffmpeg', cb => {
	try {
		fs.accessSync(buildDir);
	} catch (e) {
		fs.mkdirSync(buildDir);
	}

	const file = fs.createWriteStream(filename);

	http.get(fileURL, response => {
		response.pipe(file);

		file.on('finish', () => {
			file.close();
			cb();
		})
	});
});

// Resorting to using a shell task. Tried a number of other things including
// LZMA-native, node-xz, decompress-tarxz. None of them work very well with this.
// This will probably work well for OS X and Linux, but maybe not Windows without Cygwin.
gulp.task('untar-ffmpeg', shell.task([
	`tar -xvf ${filename} -C ./build`
]));

gulp.task('copy-ffmpeg', () => {
	const wd = fs
		.readdirSync(buildDir)
		.filter(item => fs
			.statSync(path.join(buildDir, item))
			.isDirectory()
		)[0];

	return gulp
		.src([
			'ffmpeg',
			'ffprobe'
		], {
			cwd: path.join(buildDir, wd)
		})
		.pipe(gulp.dest('dist'));
});

// First we need to clean out the dist folder and remove the compiled zip file.
gulp.task('clean', () =>
	del([
		'./build/*',
		'./dist/*',
		'./dist.zip'
	])
);

// Here we want to install npm packages to dist, ignoring devDependencies.
gulp.task('npm', () => gulp
	.src('./package.json')
	.pipe(gulp.dest('./dist'))
	.pipe(install({
		production: true,
		ignoreScripts: true
	}))
);

// Now the dist directory is ready to go. Zip it.
gulp.task('zip', () => gulp
	.src([
		'dist/**/*',
		'!dist/package.json',
		'!**/LICENSE',
		'!**/*.md',
		'dist/.*'
	])
	.pipe(chmod(555))
	.pipe(zip('dist.zip'))
	.pipe(gulp.dest('./'))
);

const baseDir = 'platform';

fs.readdirSync(baseDir)
	.filter(item => fs
		.statSync(path.join(baseDir, item))
		.isDirectory()
	)
	.forEach(platform => {
		gulp.task(`${platform}:transpile`, () => gulp
			.src([
				'common.js',
				`${platform}/index.js`,
				`${platform}/lib.js`
			], {
				base: baseDir,
				cwd: baseDir
			})
			.pipe(babel({
				presets: [
					// TODO remove this when GCF updates to Node v4
					platform === 'gcp' ? 'es2015' : 'es2015-node4'
				]
			}))
			.pipe(gulp.dest('dist'))
		);

		gulp.task(`${platform}:config`, () => gulp
			.src(`config/${platform}.json`)
			.pipe(gulp.dest('dist'))
		);
		
		gulp.task(`${platform}:source`, [
			`${platform}:transpile`,
			`${platform}:config`
		]);

		require(path.join(__dirname, baseDir, platform, 'gulpfile.js'))(gulp, platform);
	});