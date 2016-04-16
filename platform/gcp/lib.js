process.env['PATH'] += ':' + process.env['CODE_LOCATION'];
process.env['GCLOUD_PROJECT'] = process.env['GCLOUD_PROJECT'] || process.env['GCP_PROJECT'];

var gcloud = require('gcloud');
var gcs = gcloud.storage();

/**
 * Creates a readable stream from a GCS Object reference
 *
 * @param {string} bucket - The GCS Bucket
 * @param {string} key - The GCS File
 * @param {requestCallback} cb
 * @returns {Object}
 */
exports.getDownloadStream = function(bucket, key, cb) {
	return gcs
		.bucket(bucket)
		.file(key)
		.createReadStream()
		.on('error', function(response) {
			cb('GCS download error:', JSON.stringify(response));
		});
};

/**
 * Normalizes the location of a cloud storage object for GCS
 *
 * @param {Object} event
 * @returns {{bucket: {string}, key: {string}}}
 */
exports.getFileLocation = function(event) {
	return {
		bucket: event.bucket,
		key: event.name
	};
};

/**
 * Uploads a file to a GCS Bucket
 *
 * @param {string} bucket - The GCS bucket name 
 * @param {string} key - The GCS file path
 * @param {module:fs~ReadStream} fileStream - The file stream to upload
 * @param {string} contentEncoding - The Content-Encoding of the file (gzip or none)
 * @param {string|null} contentType - The Content-Type of the file (e.g. video/mp4)
 * @param {requestCallback} cb - The callback
 */
exports.uploadToBucket = function(bucket, key, fileStream, contentEncoding, contentType, cb) {
	var options = {
		metadata: {
			contentType: contentType,
			cacheControl: 'max-age=31536000' // 1 year (60 * 60 * 24 * 365)
		}
	};

	if (contentEncoding)
		options.metadata.contentEncoding = contentEncoding;

	var writeStream = gcs
		.bucket(bucket)
		.file(key)
		.createWriteStream(options);

	fileStream.pipe(writeStream)
		.on('error', cb)
		.on('finish', cb);
};