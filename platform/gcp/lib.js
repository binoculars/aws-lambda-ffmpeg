process.env['PATH'] += ':' + process.env['CODE_LOCATION'];
process.env['GCLOUD_PROJECT'] = process.env['GCLOUD_PROJECT'] || process.env['GCP_PROJECT'];

import * as gcloud from 'google-cloud';

const gcs = gcloud.storage();

/**
 * Creates a readable stream from a GCS Object reference
 *
 * @param {!string} bucket - The GCS Bucket
 * @param {!string} key - The GCS File
 * @returns {Object}
 */
export function getDownloadStream(bucket, key) {
	return gcs
		.bucket(bucket)
		.file(key)
		.createReadStream()
		.on('error', Promise.reject);
}

/**
 * Normalizes the location of a cloud storage object for GCS
 *
 * @param {!Object} event
 * @param {!string} event.bucket
 * @param {!string} event.name
 * @returns {{bucket: {string}, key: {string}}}
 */
export function getFileLocation(event) {
	return {
		bucket: event.bucket,
		key: event.name
	};
}

/**
 * Uploads a file to a GCS Bucket
 *
 * @param {!string} bucket - The GCS bucket name 
 * @param {!string} key - The GCS file path
 * @param {!module:fs~ReadStream} fileStream - The file stream to upload
 * @param {string} contentEncoding - The Content-Encoding of the file (gzip or none)
 * @param {!string} contentType - The Content-Type of the file (e.g. video/mp4)
 */
export function uploadToBucket(bucket, key, fileStream, contentEncoding, contentType) {
	const options = {
		metadata: {
			contentType: contentType,
			cacheControl: 'max-age=31536000' // 1 year (60 * 60 * 24 * 365)
		}
	};

	if (contentEncoding)
		options.metadata.contentEncoding = contentEncoding;

	const writeStream = gcs
		.bucket(bucket)
		.file(key)
		.createWriteStream(options);

	return new Promise((resolve, reject) =>
		fileStream.pipe(writeStream)
			.on('error', reject)
			.on('finish', resolve)
	);
}