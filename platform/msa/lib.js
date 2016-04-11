var azure = require('azure-storage');
var blobService = azure.createBlobService();

/**
 * Creates a readable stream from an Azure Storage blob
 *
 * @param {string} bucket - The Azure Storage container name
 * @param {string} key - The Blob name
 * @param {requestCallback} cb
 * @returns {Object}
 */
exports.getDownloadStream = function(bucket, key, cb) {
	console.log('Starting download', bucket, key);

	return blobService
		.createReadStream(bucket, key);
};

/**
 * Normalizes the location of a blob for Azure Storage
 *
 * @param {Object} event
 * @returns {{bucket: string, key: string}}
 */
exports.getFileLocation = function(event) {
	// TODO Fix this when we know what the real event looks like
	return {
		bucket: event.container,
		key: event.name
	};
};

/**
 * Uploads a file to an Azure Storage Container
 *
 * @param {string} bucket - The Azure Storage container name
 * @param {string} key - The Blob name
 * @param {module:fs~ReadStream} fileStream - The file stream to upload
 * @param {string} contentEncoding - The Content-Encoding of the file (gzip or none)
 * @param {string|null} contentType - The Content-Type of the file (e.g. video/mp4)
 * @param {requestCallback} cb - The callback
 */
exports.uploadToBucket = function(bucket, key, fileStream, contentEncoding, contentType, cb) {
	var options = {
		contentSettings: {
			contentType: contentType,
			cacheControl: 'max-age=31536000' // 1 year (60 * 60 * 24 * 365)
		}
	};

	if (contentEncoding)
		options.contentSettings.contentEncoding = contentEncoding;

	var writeStream = blobService.createWriteStreamToBlockBlob(bucket, key, options);

	fileStream.pipe(writeStream)
		.on('error', cb)
		.on('finish', cb);
};