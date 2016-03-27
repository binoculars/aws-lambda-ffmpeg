process.env['NODE_ENV'] = 'production';
process.env['PATH'] += ':' + process.env['LAMBDA_TASK_ROOT'];

var child_process = require('child_process');
var fs = require('fs');
var util = require('util');
var zlib = require('zlib');
var crypto = require('crypto');
var stream = require('stream');
var path = require('path');
var AWS = require('aws-sdk');
var async = require('async');
var config = require('./config');
var scaleFilter = "scale='min(" + config.videoMaxWidth.toString() + "\\,iw):-2'";
var s3 = new AWS.S3();
var tempDir = process.env['TEMP'] || '/tmp';

/**
 * Creates a readable stream from an S3 Object reference
 * 
 * @param {string} bucket - The S3 Bucket
 * @param {string} file - The S3 Key
 * @param {requestCallback} cb
 * @returns {Object}
 */
function downloadStream(bucket, file, cb) {
	console.log('Starting download');

	return s3.getObject({
		Bucket: bucket,
		Key: file
	}).on('error', function(res) {
		cb('S3 download error: ' + JSON.stringify(res));
	}).createReadStream();
}


/**
 * Uploads a file to an S3 Bucket
 *
 * @param {Object} params - The S3 upload parameters
 * @param {string} filename - The local filename
 * @param {requestCallback} cb
 */
function s3upload(params, filename, cb) {
	s3.upload(params)
		.on('httpUploadProgress', function(evt) {
			console.log(filename, 'Progress:', evt.loaded, '/', evt.total);
		})
		.send(cb);
}


/**
 * Prepares and uploads a file
 *
 * @param {string} fileExt - The extension of the filename
 * @param {string} bucket - The S3 Bucket
 * @param {string} keyPrefix - The prefix for the S3 key
 * @param {string} contentType - The content type (MIME type) of the file
 * @param {requestCallback} cb
 */
function uploadFile(fileExt, bucket, keyPrefix, contentType, cb) {
	console.log('Uploading', contentType);

	var filename = path.join(tempDir, 'out.' + fileExt);
	var rmFiles = [filename];
	var readStream = fs.createReadStream(filename);

	var params = {
		Bucket: bucket,
		Key: keyPrefix + '.' + fileExt,
		ContentType: contentType,
		CacheControl: 'max-age=31536000' // 1 year (60 * 60 * 24 * 365)
	};

	async.waterfall([
		function(cb) {
			if (!config.gzip)
				return cb(null, readStream, filename);

			var gzipFilename = filename + '.gzip';

			rmFiles.push(gzipFilename);
			params.ContentEncoding = 'gzip';

			var gzipWriteStream = fs.createWriteStream(gzipFilename);

			gzipWriteStream.on('finish', function() {
				cb(null, fs.createReadStream(filename), gzipFilename);
			});

			readStream
				.pipe(zlib.createGzip({level: zlib.Z_BEST_COMPRESSION}))
				.pipe(gzipWriteStream);
		},
		function(fstream, uploadFilename, cb) {
			console.log('Begin hashing', uploadFilename);

			var hash = crypto.createHash('sha256');

			fstream.on('data', function(d) {
				hash.update(d);
			});

			fstream.on('end', function() {
				cb(null, fs.createReadStream(uploadFilename), hash.digest('hex'));
			});
		},
		function(fstream, hashdigest, cb) {
			console.log(filename, 'hashDigest:', hashdigest);
			params.Body = fstream;

			if (hashdigest)
				params.Metadata = {'sha256': hashdigest};

			s3upload(params, filename, cb);
		},
		function(data, cb) {
			console.log(filename, 'complete. Deleting now.');
			async.each(rmFiles, fs.unlink, cb);
		}
	], cb);
}

/**
 * Verifies that the file contains a valid video stream and is less than the maximum duration
 *
 * @param {requestCallback} cb
 */
function ffprobeVerify(cb) {
	console.log('Starting FFprobe');

	child_process.execFile(
		'ffprobe',
		[
			'-v', 'quiet',
			'-print_format', 'json',
			'-show_format',
			'-show_streams',
			'-i', 'download'
		],
		{
			cwd: tempDir
		},
		function(err, stdout, stderr) {
			if (err) return cb(err, 'FFprobe failed' + JSON.stringify({ stdout: stdout, stderr: stderr}));

			var outputObj = JSON.parse(stdout);
			var maxDuration = config.videoMaxDuration;

			var hasVideoStream = outputObj.streams.some(function(stream) {
				return stream.codec_type === 'video' &&
						(stream.duration || outputObj.format.duration) <= maxDuration;
			});

			if (!hasVideoStream)
				return cb('FFprobe: no valid video stream found');
			else {
				console.log('valid video stream found', stdout);
				return cb(err, 'FFprobe finished');
			}
		}
	);
}

/**
 * Runs the FFmpeg command on the file
 * 
 * @param {string} description
 * @param {requestCallback} cb
 */
function ffmpegProcess(description, cb) {
	console.log('Starting FFmpeg');

	child_process.execFile(
		'ffmpeg',
		[
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
		],
		{
			cwd: tempDir
		},
		function(err, stdout, stderr) {
			console.log('FFmpeg done.');
			return cb(err, 'FFmpeg finished:' + JSON.stringify({ stdout: stdout, stderr: stderr}));
		}
	);
}

/**
 * Downloads the file from S3, sends it to FFprobe, processes it through FFmpeg, and deletes the downloaded file.
 * 
 * @param {Object} s3Event
 * @param {string} srcKey
 * @param {requestCallback} cb
 */
function processVideo(s3Event, srcKey, cb) {
	var dlFile = path.join(tempDir, 'download');

	async.series([
		function(cb) {
			var dlStream = downloadStream(s3Event.bucket.name, srcKey, cb);
			dlStream.on('end', function() {
				cb(null, 'download finished');
			});
			dlStream.pipe(fs.createWriteStream(dlFile));
		},
		function(cb) {
			ffprobeVerify(cb);
		},
		function(cb) {
			ffmpegProcess(config.linkPrefix + '/' + srcKey + '.' + config.format.video.extension, cb);
		},
		function(cb) {
			console.log('Deleting download file');
			fs.unlink(dlFile, cb);
		}
	], cb);
}

/**
 * The main handler for the lambda function
 * 
 * @param {Object} event - The S3 Event
 * @param {Object} context - The Lambda context
 */
exports.handler = function(event, context) {
	console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));

	var s3Event = event.Records[0].s3;
	var srcKey = decodeURIComponent(s3Event.object.key);
	var keyPrefix = srcKey.replace(/\.[^/.]+$/, '');
	var format = config.format;

	async.series([
		function (cb) { processVideo(s3Event, srcKey, cb); },
		function (cb) {
			var dstBucket = config.destinationBucket;
			async.parallel([
				function (cb) { uploadFile(format.video.extension, dstBucket, keyPrefix, format.video.mimeType, cb); },
				function (cb) { uploadFile(format.image.extension, dstBucket, keyPrefix, format.image.mimeType, cb); }
			], cb);
		}
	], function(err, results) {
		if (err) context.fail(err);
		else context.succeed(results);
	});
};