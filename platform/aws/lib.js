process.env['PATH'] += ':' + process.env['LAMBDA_TASK_ROOT'];

var AWS = require('aws-sdk');
var s3 = new AWS.S3();

/**
 * Creates a readable stream from an S3 Object reference
 *
 * @param {string} bucket - The S3 Bucket
 * @param {string} key - The S3 Key
 * @param {requestCallback} cb
 * @returns {Object}
 */
exports.getDownloadStream = function(bucket, key, cb) {
	return s3
		.getObject({
			Bucket: bucket,
			Key: key
		})
		.on('error', function(response) {
			cb('S3 download error:', JSON.stringify(response));
		})
		.createReadStream();
};


/**
 * Normalizes the location of a cloud storage object for S3
 * 
 * @param {Object} event
 * @returns {{bucket: string, key: string}}
 */
exports.getFileLocation = function(event) {
	var s3Event = event.Records[0].s3;
	
	return {
		bucket: s3Event.bucket.name,
		key: decodeURIComponent(s3Event.object.key).replace(/\+/g, ' ')
	};
};

/**
 * Uploads a file to an S3 Bucket
 *
 * @param {string} bucket - The S3 bucket name
 * @param {string} key - The S3 key
 * @param {module:fs~ReadStream} fileStream - The file stream to upload
 * @param {string} contentEncoding - The Content-Encoding of the file (gzip or none)
 * @param {string|null} contentType - The Content-Type of the file (e.g. video/mp4)
 * @param {requestCallback} cb - The callback
 */
exports.uploadToBucket = function(bucket, key, fileStream, contentEncoding, contentType, cb) {
	var params = {
		Bucket: bucket,
		Key: key,
		Body: fileStream,
		ContentType: contentType,
		CacheControl: 'max-age=31536000' // 1 year (60 * 60 * 24 * 365)
	};

	if (contentEncoding)
		params.ContentEncoding = contentEncoding;
	
	s3.upload(params)
		.on('httpUploadProgress', function(evt) {
			console.log(contentType, 'Progress:', evt.loaded, '/', evt.total, Math.round(100 * evt.loaded / evt.total) + '%');
		})
		.send(cb);
};