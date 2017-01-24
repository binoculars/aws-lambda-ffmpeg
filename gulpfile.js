'use strict';

const parse = require('url').parse;
const https = require('https');
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
const filename = path.join(buildDir, 'ffmpeg-build-lambda.tar.gz');
const releaseUrl = 'https://api.github.com/repos/binoculars/ffmpeg-build-lambda/releases/latest';

const packageJson = require('./package.json');

function request(url, toPipe) {
	const options = parse(url);
	options.headers = {
		'User-Agent': 'node'
	};

	return new Promise((resolve, reject) => {
		const req = https.get(options, response => {
			if (response.statusCode < 200 || response.statusCode > 299) {
				if (response.statusCode === 302)
					return request(response.headers.location, toPipe);

				return reject(new Error('Failed to load page, status code: ' + response.statusCode));
			}

			let body = '';

			if (toPipe)
				response.pipe(toPipe);
			else
				response.on('data', chunk => body += chunk);

			response.on('end', () => resolve(body));
		});

		req.on('error', reject);
	});
}

gulp.task('download-ffmpeg', cb => {
	try {
		fs.accessSync(buildDir);
	} catch (e) {
		fs.mkdirSync(buildDir);
	}

	const file = fs.createWriteStream(filename);

	file.on('finish', () => {
		file.close();
		cb();
	});

	request(releaseUrl)
		.then(JSON.parse)
		.then(result => {
			const fileUrl = result.assets[0].browser_download_url;

			return request(fileUrl, file);
		});
});

// This will probably work well for OS X and Linux, but maybe not Windows without Cygwin.
gulp.task('untar-ffmpeg', shell.task([
	`mkdir -p ./build/ffmpeg && tar -zxvf ${filename} -C ./build/ffmpeg`
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
	.pipe(chmod(0o555))
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
				'lib.js',
				`${platform}/index.js`,
				`${platform}/lib.js`
			], {
				base: baseDir,
				cwd: baseDir
			})
			.pipe(babel({
				presets: [
					[
						'env',
						{
							targets: {
								node: platform === 'aws' ? 4.3 : 6.9
							},
							exclude: packageJson.babel.presets[0][1].exclude
						}
					]
				],
				env: 'production',
				comments: false,
				compact: true
			}))
			.pipe(gulp.dest('dist'))
		);

		gulp.task(`${platform}:config`, () => gulp
			.src(`config/${platform}.json`)
			.pipe(rename('config.json'))
			.pipe(gulp.dest('dist'))
		);
		
		gulp.task(`${platform}:source`, [
			`${platform}:transpile`,
			`${platform}:config`
		]);

		require(path.join(__dirname, baseDir, platform, 'gulpfile.js'))(gulp, platform);
	});
