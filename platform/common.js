'use strict';

process.env['NODE_ENV'] = 'production';

import {spawn, execFile} from 'child_process';
import {unlink, createReadStream, createWriteStream} from 'fs';
import {createGzip, Z_BEST_COMPRESSION} from 'zlib';
import {join} from 'path';
import {tmpdir} from 'os';
import {checkM3u} from './lib';

/** @type string **/
const tempDir = process.env['TEMP'] || tmpdir();
const config = require(process.env.CONFIG_FILE || './config.json');
let log = console.log;

/**
 * Downloads the file to the local temp directory
 *
 * @param {!function} downloadFunc - The platform library's download function
 * @param {{bucket: !string, key: !string}} sourceLocation - The location of the remote file
 * @param {!string} download - The location of the local file
 * @returns {Promise}
 */
function downloadFile(downloadFunc, sourceLocation, download) {
	return new Promise((resolve, reject) => {
		log(`Starting download: ${sourceLocation.bucket} / ${sourceLocation.key}`);

		downloadFunc(sourceLocation.bucket, sourceLocation.key)
			.on('end', () => {
				log('Download finished');
				resolve();
			})
			.on('error', reject)
			.pipe(createWriteStream(download));
	});
}

/**
 * Runs FFprobe and ensures that the input file has a valid stream and meets the maximum duration threshold.
 *
 * @returns {Promise}
 */
function ffprobe() {
	log('Starting FFprobe');

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

			log(stdout);

			const {streams, format} = JSON.parse(stdout);
			const {videoMaxDuration} = config;

			const hasVideoStream = streams.some(({codec_type, duration}) =>
				codec_type === 'video' &&
				(duration || format.duration) <= videoMaxDuration
			);

			if (!hasVideoStream)
				reject('FFprobe: no valid video stream found');
			else {
				log('Valid video stream found. FFprobe finished.');
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
 * @param {string} keyPrefix - The prefix for the key (filename minus extension)
 * @returns {Promise}
 */
function ffmpeg(keyPrefix) {
	log('Starting FFmpeg');

	const {format} = config;
	const description = `${config.linkPrefix}/${keyPrefix}.${format.video.extension}`;
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
			`out.${format.video.extension}`,
			'-vf', 'thumbnail',
			'-vf', scaleFilter,
			'-vframes', '1',
			`out.${format.image.extension}`
		];
		const opts = {
			cwd: tempDir
		};
		
		spawn('ffmpeg', args, opts)
			.on('message', msg => log(msg))
			.on('error', reject)
			.on('close', resolve);
	});
}

/**
 * Deletes a file
 *
 * @param {!string} localFilePath - The location of the local file
 * @returns {Promise<void>}
 */
function removeFile(localFilePath) {
	log(`Deleting ${localFilePath}`);

	return new Promise((resolve, reject) => {
		unlink(
			localFilePath,
			(err, result) => err ? reject(err) : resolve(result)
		);
	});
}

/**
 * Encodes the file, if gzip is enabled
 *
 * @param {!string} filename - The filename of the file to encode
 * @param {boolean} gzip - Whether to GZIP-encode the file, or pass it through
 * @param {!Array<string>} rmFiles - The files to remove after the operation is complete
 * @returns {Promise<module:fs~ReadStream>}
 */
function encode(filename, gzip, rmFiles) {
	return new Promise((resolve) => {
		const readStream = createReadStream(filename);

		if (!gzip)
			return resolve(readStream);

		log(`GZIP encoding ${filename}`);
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
 * @param {!function} uploadFunc - The function to upload a processed file
 * @param {!module:fs~ReadStream} fileStream - The stream of a processed file
 * @param {!string} bucket - The remote bucket
 * @param {!string} key - The remote key/file path
 * @param {string} encoding - The Content Encoding
 * @param {string} mimeType - The MIME Type of the file
 * @returns {Promise}
 */
function upload(uploadFunc, fileStream, bucket, key, encoding, mimeType) {
	log(`Uploading ${mimeType}`);

	return uploadFunc(bucket, key, fileStream, encoding, mimeType);
}

/**
 * Deletes the local output files
 *
 * @param {!string} filename - The name of the file
 * @param {!Array<string>} rmFiles - The files to remove after the operation is complete
 */
function removeFiles(filename, rmFiles) {
	log(`${filename} complete.`);

	return Promise.all(
		rmFiles.map(removeFile)
	);
}

/**
 * Transforms, uploads, and deletes an output file
 *
 * @param {!function} uploadFunc - The function to upload a processed file minus extension)
 * @param {!string} keyPrefix - The filename without the extension
 * @param {!string} type - The output file type, as specified in the configuration
 * @returns {Promise}
 */
async function uploadFile(uploadFunc, keyPrefix, type) {
	const format = config.format[type];
	const filename = join(tempDir, `out.${format.extension}`);
	const rmFiles = [filename];

	const fileStream = await encode(filename, config.gzip, rmFiles);
	await upload(
		uploadFunc,
		fileStream,
		config.destinationBucket,
		`${keyPrefix}.${format.extension}`,
		config.gzip ? 'gzip' : null,
		format.mimeType
	);
	await removeFiles(filename, rmFiles);
}

/**
 * Uploads the output files
 *
 * @param {!function} uploadFunc - The function to upload a processed file
 * @param {!string} keyPrefix - The prefix for the key (filename minus extension)
 * @returns {Promise}
 */
function uploadFiles(uploadFunc, keyPrefix) {
	return Promise
		.all(Object
			.keys(config.format)
			.map(type => uploadFile(uploadFunc, keyPrefix, type))
		);
}

/**
 * The main function
 *
 * @param {!object} library - The platform library
 * @param {!function} library.getDownloadStream
 * @param {!function} library.getFileLocation
 * @param {!function} library.uploadToBucket
 * @param {!object} logger - The platform logger
 * @param {!function} logger.log - The logging function
 * @param {!object} invocation - The invocation
 * @param {!object} invocation.event
 * @param {!function} invocation.callback
 */
export async function main(library, logger, invocation) {
	log = logger.log;
	const sourceLocation = library.getFileLocation(invocation.event);
	const keyPrefix = sourceLocation.key.replace(/\.[^/.]+$/, '');
	const localFilePath = join(tempDir, 'download');

	let error = null;

	try {
		await downloadFile(library.getDownloadStream, sourceLocation, localFilePath);
		await checkM3u(localFilePath);
		await ffprobe();
		await ffmpeg(keyPrefix);
		await Promise.all([
			removeFile(localFilePath),
			uploadFiles(library.uploadToBucket, keyPrefix)
		]);
	} catch (e) {
		error = e;
	}

	invocation.callback(error);
}
