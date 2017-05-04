'use strict';

const parse = require('url').parse;
const https = require('https');
const fs = require('fs');
const child_process = require('child_process');
const path = require('path');
const gulp = require('gulp');
const rename = require('gulp-rename');
const del = require('del');
const chmod = require('gulp-chmod');
const install = require('gulp-install');
const zip = require('gulp-zip');
const babel = require('gulp-babel');

const buildDir = 'build';
const filename = path.join(buildDir, 'ffmpeg-build-lambda.tar.gz');
const releaseUrl = 'https://api.github.com/repos/binoculars/ffmpeg-build-lambda/releases/latest';

function request(url, toPipe, retries = 0) {
	const options = parse(url);
	options.headers = {
		'User-Agent': 'node'
	};

	return new Promise((resolve, reject) => {
		const req = https.get(options, response => {
			const {statusCode} = response;

			if (statusCode < 200 || statusCode > 299) {
				if (statusCode === 302)
					return request(response.headers.location, toPipe);

				if (statusCode === 403 && retries < 3)
					return new Promise((resolve, reject) => {
						const tryCount = retries + 1;

						console.log(`Request failed, retrying ${tryCount} of 3`);

						setTimeout(
							() => {
								return request(url, toPipe, tryCount)
									.then(resolve)
									.catch(reject);
							},
							3e3
						);
					});

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
	if (!fs.existsSync(buildDir))
		fs.mkdirSync(buildDir);

	const file = fs.createWriteStream(filename);

	file.on('finish', () => {
		file.close();
		cb();
	});

	request(releaseUrl)
		.then(JSON.parse)
		.then(({assets: [{browser_download_url}]}) => request(browser_download_url, file));
});

// This will probably work well for OS X and Linux, but maybe not Windows without Cygwin.
gulp.task('untar-ffmpeg', () => {
	const dir = './build/ffmpeg';

	if (!fs.existsSync(dir))
		fs.mkdirSync(dir);

	child_process.execSync(
		`tar -zxvf ${filename} -C ${dir}`
	);
});

gulp.task('copy-ffmpeg', () => {
	const [wd] = fs
		.readdirSync(buildDir)
		.filter(item => fs
			.statSync(path.join(buildDir, item))
			.isDirectory()
		);

	return gulp
		.src(process.env.CI ? '*' : 'ff*', {
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
								node: platform === 'aws' ? 6.10 : 6.9
							}
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
