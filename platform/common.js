'use strict';

process.env['NODE_ENV'] = 'production';

const child_process = require('child_process');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

/** @type string **/
const tempDir = process.env['TEMP'] || require('os').tmpdir();

/**
 * Downloads the file to the local temp directory
 *
 * @param {!function} downloadFunc - The platform library's download function
 * @param {!{log: !function}} logger - The platform logger
 * @param {{bucket: !string, key: !string}} sourceLocation - The location of the remote file
 * @param {!string} download - The location of the local file
 * @returns {Promise}
 */
function downloadFile(downloadFunc, logger, sourceLocation, download) {
	return new Promise((resolve) => {
		logger.log('Starting download:', sourceLocation.bucket, '/', sourceLocation.key);

		downloadFunc(sourceLocation.bucket, sourceLocation.key)
			.on('end', () => {
				logger.log('Download finished');
				resolve();
			})
			.pipe(fs.createWriteStream(download));
	});
}

/**
 * Runs FFprobe and ensures that the input file has a valid stream and meets the maximum duration threshold.
 *
 * @param {Object} config - The configuration
 * @param {!{log: !function}} logger - The platform logger
 * @returns {Promise}
 */
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

			logger.log(stdout);

			const outputObj = JSON.parse(stdout);
			const maxDuration = config.videoMaxDuration;

			const hasVideoStream = outputObj.streams.some((stream) => {
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

/**
 * Runs the FFmpeg executable
 *
 * @param {object} config - The configuration
 * @param {!{log: !function}} logger - The platform logger
 * @param {string} keyPrefix - The prefix for the key (filename minus extension)
 * @returns {Promise}
 */
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

/**
 * Deletes the download file
 *
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} localFilePath - The location of the local file
 * @returns {Promise<void>}
 */
function removeDownload(logger, localFilePath) {
	logger.log('Deleting download file');
	fs.unlinkSync(localFilePath);

	return Promise.resolve();
}

/**
 * Encodes the file, if gzip is enabled
 *
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} filename - The filename of the file to encode
 * @param {boolean} gzip - Whether to GZIP-encode the file, or pass it through
 * @param {!Array<string>} rmFiles - The files to remove after the operation is complete
 * @returns {Promise<fs.streamReadable>}
 */
function encode(logger, filename, gzip, rmFiles) {
	return new Promise((resolve) => {
		const readStream = fs.createReadStream(filename);

		if (!gzip)
			return resolve(readStream);

		logger.log('GZIP encoding', filename);
		const gzipFilename = filename + '.gzip';

		rmFiles.push(gzipFilename);

		const gzipWriteStream = fs.createWriteStream(gzipFilename);

		gzipWriteStream.on('finish', () => resolve(fs.createReadStream(gzipFilename)));

		readStream
			.pipe(zlib.createGzip({level: zlib.Z_BEST_COMPRESSION}))
			.pipe(gzipWriteStream);
	});
}

/**
 * Uploads the file
 *
 * @param {!{log: !function}} logger - The platform logger
 * @param {!function} uploadFunc - The function to upload a processed file
 * @param {!fs.streamReaddable} - The stream of a processed file
 * @param {!string} bucket - The remote bucket
 * @param {!string} key - The remote key/file path
 * @param {string} encoding - The Content Encoding
 * @param {string} mimeType - The MIME Type of the file
 * @returns {Promise}
 */
function upload(logger, uploadFunc, fileStream, bucket, key, encoding, mimeType) {
	logger.log('Uploading', mimeType);

	return uploadFunc(bucket, key, fileStream, encoding, mimeType);
}

/**
 * Deletes the local output files
 * 
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} filename - The name of the file
 * @param {!Array<string>} rmFiles - The files to remove after the operation is complete
 */
function removeFiles(logger, filename, rmFiles) {
	logger.log(filename, 'complete. Deleting now.');

	return rmFiles
		.forEach(fs.unlinkSync);
}

/**
 * Transforms, uploads, and deletes an output file
 *
 * @param {!function} uploadFunc - The function to upload a processed file
 * @param {object} config - The configuration
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} keyPrefix - The prefix for the key (filename minus extension)
 * @param {!string} type - The output file type, as specified in the configuration
 * @returns {Promise}
 */
function uploadFile(uploadFunc, config, logger, keyPrefix, type) {
	const format = config.format[type];
	const filename = path.join(tempDir, 'out.' + format.extension);
	const rmFiles = [filename];

	return encode(logger, filename, config.gzip, rmFiles)
		.then(fileStream => upload(
			logger,
			uploadFunc,
			fileStream,
			config.destinationBucket,
			keyPrefix + '.' + format.extension,
			config.gzip ? 'gzip' : null,
			format.mimeType
		))
		.then(() => removeFiles(logger, filename, rmFiles));
}

/**
 * Uploads the output files
 *
 * @param {!function} uploadFunc - The function to upload a processed file
 * @param {object} config - The configuration
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} keyPrefix - The prefix for the key (filename minus extension)
 * @returns {Promise}
 */
function uploadFiles(uploadFunc, config, logger, keyPrefix) {
	return Promise
		.all(Object.keys(config.format)
			.map(type => uploadFile(uploadFunc, config, logger, keyPrefix, type))
		);
}

/**
 * The main function
 *
 * @param {!{
 *     getDownloadStream: !function,
 *     getFileLocation: !function,
 *     uploadToBucket: !function
 * }} library - The platform library
 * @param {object} config - The configuration
 * @param {!{log: !function}} logger - The platform logger
 * @param {!{
 *     event: !object,
 *     callback: !function
 * }} invocation - The invocation
 */
exports.main = function(library, config, logger, invocation) {
	const sourceLocation = library.getFileLocation(invocation.event);
	const keyPrefix = sourceLocation.key.replace(/\.[^/.]+$/, '');
	const localFilePath = path.join(tempDir, 'download');

	downloadFile(library.getDownloadStream, logger, sourceLocation, localFilePath)
		.then(() => ffprobe(config, logger))
		.then(() => ffmpeg(config, logger, keyPrefix))
		.then(() => removeDownload(logger, localFilePath))
		.then(() => uploadFiles(library.uploadToBucket, config, logger, keyPrefix))
		.then(data => invocation.callback())
		.catch(error => invocation.callback(error));
};