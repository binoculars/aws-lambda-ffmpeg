'use strict';

process.env['NODE_ENV'] = 'production';

const child_process = require('child_process');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const tempDir = process.env['TEMP'] || require('os').tmpdir();

function downloadFile(library, logger, sourceLocation, dlFile) {
	return new Promise((resolve) => {
		logger.log('Starting download:', sourceLocation.bucket, '/', sourceLocation.key);

		library.getDownloadStream(sourceLocation.bucket, sourceLocation.key)
			.on('end', () => {
				logger.log('Download finished');
				resolve();
			})
			.pipe(fs.createWriteStream(dlFile));
	});
}

function ffprobe(config, logger) {
	logger.log('Starting FFprobe');

	return new Promise((resolve, reject) => {
		const cmd = 'ffprobe';
		const args = [
			'-v', 'quiet',
			'-print_format', 'json',
			'-show_format',
			'-show_streams',
			'-i', 'download'
		];
		const opts = {
			cwd: tempDir
		};

		const cb = (error, stdout) => {
			if (error)
				reject(error);

			console.log(stdout);

			let outputObj = JSON.parse(stdout);
			let maxDuration = config.videoMaxDuration;

			let hasVideoStream = outputObj.streams.some((stream) => {
				return stream.codec_type === 'video' &&
					(stream.duration || outputObj.format.duration) <= maxDuration;
			});

			if (!hasVideoStream)
				reject('FFprobe: no valid video stream found');
			else {
				logger.log('Valid video stream found. FFprobe finished.');
				resolve();
			}
		};


		child_process.execFile(cmd, args, opts, cb)
			.on('error', reject);
	});
}

function ffmpeg(config, logger, keyPrefix) {
	logger.log('Starting FFmpeg');

	let description = config.linkPrefix + '/' + keyPrefix + '.' + config.format.video.extension;
	let scaleFilter = "scale='min(" + config.videoMaxWidth.toString() + "\\,iw):-2'";

	return new Promise((resolve, reject) => {
		let cmd = 'ffmpeg';
		let args = [
			'-y',
			'-loglevel', 'warning',
			'-i', 'download',
			'-c:a', 'copy',
			'-vf', scaleFilter,
			'-movflags', '+faststart',
			'-metadata', 'description=' + description,
			'out.' + config.format.video.extension,
			'-vf', 'thumbnail',
			'-vf', scaleFilter,
			'-vframes', '1',
			'out.' + config.format.image.extension
		];
		let opts = {
			cwd: tempDir
		};
		child_process.spawn(cmd, args, opts)
			.on('message', msg => {
				logger.log(msg);
			})
			.on('error', reject)
			.on('close', resolve);
	});
}

function removeDownload(logger, dlFile) {
	logger.log('Deleting download file');
	fs.unlinkSync(dlFile);
	return Promise.resolve();
}

function uploadFiles(library, config, logger, keyPrefix) {
	return Promise
		.all(Object.keys(config.format)
			.map(type => {
				const format = config.format[type];
				const filename = path.join(tempDir, 'out.' + format.extension);
				const rmFiles = [filename];
				const key = keyPrefix + '.' + format.extension;
				let contentEncoding = null;

				logger.log('Uploading', format.mimeType);

				return new Promise((resolve) => {
					const readStream = fs.createReadStream(filename);

					if (!config.gzip)
						return resolve(readStream);

					contentEncoding = 'gzip';
					const gzipFilename = filename + '.gzip';

					rmFiles.push(gzipFilename);

					const gzipWriteStream = fs.createWriteStream(gzipFilename);

					gzipWriteStream.on('finish', () => resolve(fs.createReadStream(gzipFilename)));

					readStream
						.pipe(zlib.createGzip({level: zlib.Z_BEST_COMPRESSION}))
						.pipe(gzipWriteStream);
				}).then(fileStream => {
					return new Promise((resolve, reject) => {
						library.uploadToBucket(
							config.destinationBucket,
							key,
							fileStream,
							contentEncoding,
							format.mimeType,
							(error, data) => {
								if (error) reject(error);
								else resolve(data);
							}
						);
					});
				}).then(() => {
					logger.log(filename, 'complete. Deleting now.');

					return rmFiles
						.forEach(rmFile => fs.unlinkSync(rmFile));
				});
			})
		);
}

exports.main = function(library, config, logger, invocation) {
	const sourceLocation = library.getFileLocation(invocation.event);
	const keyPrefix = sourceLocation.key.replace(/\.[^/.]+$/, '');
	const dlFile = path.join(tempDir, 'download');

	downloadFile(library, logger, sourceLocation, dlFile)
		.then(() => ffprobe(config, logger))
		.then(() => ffmpeg(config, logger, keyPrefix))
		.then(() => removeDownload(logger, dlFile))
		.then(() => uploadFiles(library, config, logger, keyPrefix))
		.then(data => invocation.callback())
		.catch(error => invocation.callback(error));
};