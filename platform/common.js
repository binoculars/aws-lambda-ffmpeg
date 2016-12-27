'use strict';

process.env['NODE_ENV'] = 'production';

import {spawn, execFile} from 'child_process';
import {unlinkSync, createReadStream, createWriteStream, readdirSync} from 'fs';
import {createGzip, Z_BEST_COMPRESSION} from 'zlib';
import {join} from 'path';
import {tmpdir} from 'os';
import {checkM3u} from './lib';

/** @type string **/
const tempDir = process.env['TEMP'] || tmpdir();
const config = require(process.env.CONFIG_FILE || './config.json');

const outputDir = join(tempDir, 'outputs');
const maxDuration = config.videoMaxDuration;

const mimeTypes = {
	'png': 'image/png',
	'mp4': 'video/mp4'
};

const extensionRegex = /\.(\w+)$/;

function getMimeType(filename) {
	return filename.match(extensionRegex)[1];
}

/**
 * Downloads the file to the local temp directory
 *
 * @param {!function} downloadFunc - The platform library's download function
 * @param {!Object} logger - The platform logger
 * @param {!function} logger.log - The logging function
 * @param {{bucket: !string, key: !string}} sourceLocation - The location of the remote file
 * @param {!string} download - The location of the local file
 * @returns {Promise}
 */
function downloadFile(downloadFunc, logger, sourceLocation, download) {
	return new Promise((resolve, reject) => {
		logger.log(`Starting download: ${sourceLocation.bucket} / ${sourceLocation.key}`);

		downloadFunc(sourceLocation.bucket, sourceLocation.key)
			.on('end', () => {
				logger.log('Download finished');
				resolve();
			})
			.on('error', reject)
			.pipe(createWriteStream(download));
	});
}

/**
 * Runs FFprobe and ensures that the input file has a valid stream and meets the maximum duration threshold.
 *
 * @param {!Object} logger - The platform logger
 * @param {!function} logger.log - The logging function
 * @returns {Promise}
 */
function ffprobe(logger) {
	logger.log('Starting FFprobe');

	return new Promise((resolve, reject) => {
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

			const hasVideoStream = outputObj.streams.some(stream =>
				stream.codec_type === 'video' &&
				(stream.duration || outputObj.format.duration) <= maxDuration
			);

			if (!hasVideoStream)
				reject('FFprobe: no valid video stream found');
			else {
				logger.log('Valid video stream found. FFprobe finished.');
				resolve();
			}
		};

		execFile('ffprobe', args, opts, cb)
			.on('error', reject);
	});
}

/**
 * Runs the FFmpeg executable
 *
 * @param {!{log: !function}} logger - The platform logger
 * @param {string} keyPrefix - The prefix for the key (filename minus extension)
 * @returns {Promise}
 */
function ffmpeg(logger, keyPrefix) {
	logger.log('Starting FFmpeg');

	const description = `${config.linkPrefix}/${keyPrefix}.${config.format.video.extension}`;
	const scaleFilter = `scale='min(${config.videoMaxWidth.toString()}\\,iw):-2'`;

	return new Promise((resolve, reject) => {
		const args = [
			'-y',
			'-loglevel', 'warning',
			'-i', 'download',
			'-c:a', 'copy',
			'-vf', scaleFilter,
			'-movflags', '+faststart',
			'-metadata', `description=${description}`,
			`out.${config.format.video.extension}`,
			'-vf', 'thumbnail',
			'-vf', scaleFilter,
			'-vframes', '1',
			`out.${config.format.image.extension}`
		];
		const opts = {
			cwd: tempDir
		};
		
		spawn('ffmpeg', args, opts)
			.on('message', msg => logger.log(msg))
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
	unlinkSync(localFilePath);

	return Promise.resolve();
}

/**
 * Encodes the file, if gzip is enabled
 *
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} filename - The filename of the file to encode
 * @param {boolean} gzip - Whether to GZIP-encode the file, or pass it through
 * @param {!Array<string>} rmFiles - The files to remove after the operation is complete
 * @returns {Promise<module:fs~ReadStream>}
 */
function encode(logger, filename, gzip, rmFiles) {
	return new Promise((resolve) => {
		const readStream = createReadStream(filename);

		if (!gzip)
			return resolve(readStream);

		logger.log(`GZIP encoding ${filename}`);
		const gzipFilename = filename + '.gzip';

		rmFiles.push(gzipFilename);

		const gzipWriteStream = createWriteStream(gzipFilename);

		gzipWriteStream.on('finish', () => resolve(createReadStream(gzipFilename)));

		readStream
			.pipe(createGzip({level: Z_BEST_COMPRESSION}))
			.pipe(gzipWriteStream);
	});
}

/**
 * Uploads the file
 *
 * @param {!{log: !function}} logger - The platform logger
 * @param {!function} uploadFunc - The function to upload a processed file
 * @param {!module:fs~ReadStream} fileStream - The stream of a processed file
 * @param {!string} bucket - The remote bucket
 * @param {!string} key - The remote key/file path
 * @param {string} encoding - The Content Encoding
 * @param {string} mimeType - The MIME Type of the file
 * @returns {Promise}
 */
function upload(logger, uploadFunc, fileStream, bucket, key, encoding, mimeType) {
	logger.log(`Uploading ${mimeType}`);

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
	logger.log(`${filename} complete. Deleting now.`);

	return rmFiles
		.forEach(unlinkSync);
}

/**
 * Transforms, uploads, and deletes an output file
 *
 * @param {!function} uploadFunc - The function to upload a processed file
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} keyPrefix - The prefix for the key (filename minus extension)
 * @param {!string} type - The output file type, as specified in the configuration
 * @returns {Promise}
 */
function uploadFile(uploadFunc, logger, keyPrefix, type) {
	const format = config.format[type];
	const filename = join(tempDir, `out.${format.extension}`);
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
 * @param {!{log: !function}} logger - The platform logger
 * @param {!string} keyPrefix - The prefix for the key (filename minus extension)
 * @returns {Promise}
 */
function uploadFiles(uploadFunc, logger, keyPrefix) {
	const files = readdirSync(outputDir)

	return Promise
		.all(Object
			.keys(config.format)
			.map(type => uploadFile(uploadFunc, logger, keyPrefix, type))
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
 * @param {!{log: !function}} logger - The platform logger
 * @param {!{
 *     event: !object,
 *     callback: !function
 * }} invocation - The invocation
 */
export function main(library, logger, invocation) {
	const sourceLocation = library.getFileLocation(invocation.event);
	const keyPrefix = sourceLocation.key.replace(/\.[^/.]+$/, '');
	const localFilePath = join(tempDir, 'download');

	downloadFile(library.getDownloadStream, logger, sourceLocation, localFilePath)
		.then(() => checkM3u(localFilePath))
		.then(() => ffprobe(logger))
		.then(() => ffmpeg(logger, keyPrefix))
		.then(() => removeDownload(logger, localFilePath))
		.then(() => uploadFiles(library.uploadToBucket, logger, keyPrefix))
		.then(data => invocation.callback())
		.catch(error => invocation.callback(error));
};