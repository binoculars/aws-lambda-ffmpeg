process.env['PATH'] += ':' + process.env['LAMBDA_TASK_ROOT'];

import S3 from 'aws-sdk/clients/s3';

const s3 = new S3();

/**
 * Creates a readable stream from an S3 Object reference
 *
 * @param {!string} Bucket - The S3 Bucket
 * @param {!string} Key - The S3 Key
 * @returns {Object}
 */
export function getDownloadStream(Bucket, Key) {
	return s3
		.getObject({
			Bucket,
			Key
		})
		.on('error', (error) => Promise.reject(`S3 Download Error: ${error}`))
		.createReadStream();
}

/**
 * Normalizes the location of a cloud storage object for S3
 *
 * @param {!Object} event - The S3 Event
 * @param {!Object[]} event.Records
 * @param {!Object} event.Records[].s3
 * @param {!Object} event.Records[].s3.bucket
 * @param {!string} event.Records[].s3.bucket.name
 * @param {!Object} event.Records[].s3.object
 * @param {!string} event.Records[].s3.object.key
 * @returns {{bucket: string, key: string}}
 */
export function getFileLocation({Records: [{s3: {bucket, object}}]}) {
	return {
		bucket: bucket.name,
		key: decodeURIComponent(object.key).replace(/\+/g, ' ')
	};
}

/**
 * Uploads a file to an S3 Bucket
 *
 * @param {!string} Bucket - The S3 bucket name
 * @param {!string} Key - The S3 key
 * @param {!module:fs~ReadStream} Body - The file stream to upload
 * @param {string} contentEncoding - The Content-Encoding of the file (gzip or none)
 * @param {!string} ContentType - The Content-Type of the file (e.g. video/mp4)
 * @returns Promise
 */
export function uploadToBucket(Bucket, Key, Body, contentEncoding, ContentType) {
	const config = {
        Bucket,
        Key,
        Body,
        ContentType,
        ContentEncoding: contentEncoding || undefined,
        CacheControl: 'max-age=31536000'
    };

    if (process.env.SSE) {
        config.ServerSideEncryption = process.env.SSE;
    }
    if (process.env.SSE_KEY_ID) {
        config.SSEKMSKeyId = process.env.SSE_KEY_ID;
    }

	return s3
		.putObject(config)
		.on('httpUploadProgress', ({loaded, total}) => {
			console.log(ContentType, 'Progress:', loaded, '/', total, `${Math.round(100 * loaded / total)}%`);
		})
		.promise();
}
