process.env['PATH'] += ':' + process.env['LAMBDA_TASK_ROOT'];

import {S3} from 'aws-sdk';

const s3 = new S3();

/**
 * Creates a readable stream from an S3 Object reference
 *
 * @param {!string} bucket - The S3 Bucket
 * @param {!string} key - The S3 Key
 * @returns {Object}
 */
export function getDownloadStream(bucket, key) {
	return s3
		.getObject({
			Bucket: bucket,
			Key: key
		})
		.on('error', (error) => Promise.reject(`S3 Download Error: ${error}`))
		.createReadStream();
}

/**
 * Normalizes the location of a cloud storage object for S3
 * 
 * @param {!{
 *     Records: [{
 *         s3: {
 *             bucket: {
 *                 name: !string
 *             },
 *             object: {
 *                 key: !string
 *             }
 *         }
 *     }]
 * }} event - The S3 Event
 * @returns {{bucket: string, key: string}}
 */
export function getFileLocation(event) {
	const s3Event = event.Records[0].s3;
	
	return {
		bucket: s3Event.bucket.name,
		key: decodeURIComponent(s3Event.object.key).replace(/\+/g, ' ')
	};
}

/**
 * Uploads a file to an S3 Bucket
 *
 * @param {!string} bucket - The S3 bucket name
 * @param {!string} key - The S3 key
 * @param {!module:fs~ReadStream} fileStream - The file stream to upload
 * @param {string} contentEncoding - The Content-Encoding of the file (gzip or none)
 * @param {!string} contentType - The Content-Type of the file (e.g. video/mp4)
 * @returns Promise
 */
export function uploadToBucket(bucket, key, fileStream, contentEncoding, contentType) {
	const params = {
		Bucket: bucket,
		Key: key,
		Body: fileStream,
		ContentType: contentType,
		CacheControl: 'max-age=31536000' // 1 year (60 * 60 * 24 * 365)
	};

	if (contentEncoding)
		params.ContentEncoding = contentEncoding;

	return s3
		.putObject(params)
		.on('httpUploadProgress', evt => {
			console.log(contentType, 'Progress:', evt.loaded, '/', evt.total, Math.round(100 * evt.loaded / evt.total) + '%');
		})
		.promise();
}