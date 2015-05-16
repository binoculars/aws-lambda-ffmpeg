var child_process = require('child_process');
var fs = require('fs');
var util = require('util');
var zlib = require('zlib');
var crypto = require('crypto');
var stream = require('stream');
var AWS = require('aws-sdk');
var async = require('async');
var uuid = require('uuid');
var config = require('./config');
var scaleFilter = "scale='min(" + config.videoMaxWidth.toString() + "\\,iw):-2'";

var s3 = new AWS.S3();

function downloadStream(bucket, file, cb) {
	console.log('Starting download');

	var req = s3.getObject({
		Bucket: bucket,
		Key: file
	});

	req.on('error', function(res) {
		cb('S3 download error: ' + JSON.stringify(res));
	});

	return req.createReadStream();
}

function s3upload(params, filename, cb) {
	s3.upload(params)
		.on('httpUploadProgress', function(evt) {
			console.log(filename, 'Progress:', evt.loaded, '/', evt.total);
		})
		.send(function(err, data) {
			console.log(filename, 'complete. Deleting now.');
			fs.unlinkSync(filename);
			cb(err, data);
		})
	;
}

function uploadFile(fileExt, id, bucket, keyPrefix, contentType, cb) {
	console.log('Uploading', contentType);

	var filename = '/tmp/out.' + fileExt;
	var readStream = fs.createReadStream(filename);

	var params = {
		Bucket: bucket,
		Key: keyPrefix + '.' + fileExt,
		ContentType: contentType,
		CacheControl: 'max-age=31536000' // 1 year (60 * 60 * 24 * 365)
	};

	var md5 = crypto.createHash('md5');
	var md5pass = new stream.PassThrough;
	var s3pass = new stream.PassThrough;

	readStream.pipe(md5pass);
	readStream.pipe(s3pass);

	md5pass
		.on('data', function(d) {
			md5.update(d);
		})
		.on('end', function() {
			var digest = md5.digest();

			console.log(filename, 'md5', digest);

			if (config.gzip) {
				params.Metadata = {
					'md5': digest.toString('base64')
				};

				params.ContentEncoding = 'gzip';

				params.Body = s3pass.pipe(
					zlib.createGzip({
						level: zlib.Z_BEST_COMPRESSION
					})
				);
			}
			else {
				params.Body = s3pass;
			}

			s3upload(params, filename, cb);
		})
	;
}

function ffmpegProcess(description, cb) {
	console.log('starting ffmpeg');

	var ffmpeg = child_process.execFile(
		process.env.ffmpeg || '/tmp/ffmpeg',
		[
			'-y',
			'-loglevel', 'warning',
			'-i', '-',
			'-vf', scaleFilter,
			'-movflags', '+faststart',
			'-metadata', 'description=' + description,
			'out.mp4',
			'-vf', 'thumbnail',
			'-vf', scaleFilter,
			'-vframes', '1',
			'out.png'
		],
		{
			cwd: '/tmp',
			stdio: [null, null, null, 'pipe']
		}
	);

	ffmpeg.on('exit', function (code, signal) {
		console.log('ffmpeg done');

		if (code)
			return cb('ffmpeg Error code:' + code.toString() + 'signal:' + signal.toString());
		else
			cb();
	});

	return ffmpeg;
}

function buffer2shorturl(id) {
	return id
		.toString('base64')
		.substring(0, 22)
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
}

function processVideo(s3Event, srcKey, id, cb) {
	downloadStream(s3Event.bucket.name, srcKey, cb)
		.pipe(ffmpegProcess(config.linkPrefix + buffer2shorturl(id), cb).stdio[0]);
}

function copyffmpeg(cb) {
	// http://stackoverflow.com/questions/27708573/aws-lambda-making-video-thumbnails
	child_process.exec('cp /var/task/ffmpeg /tmp/.; chmod 755 /tmp/ffmpeg;', cb);
}

exports.handler = function(event, context) {
	console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));

	async.series([
		copyffmpeg,
		function(cb) {
			var s3Event = event.Records[0].s3;
			var srcKey = decodeURIComponent(s3Event.object.key);
			var keyPrefix = srcKey.replace(/\.[^/.]+$/, '');

			// Key structure on source bucket is 3 folders deep with a UUID filename
			var splitPrefix = keyPrefix.split('/');
			var id = new Buffer(uuid.parse(splitPrefix[2]));

			async.series([
				function (cb) { processVideo(s3Event, srcKey, id, cb); },
				function (cb) {
					var dstBucket = config.destinationBucket;
					async.parallel([
						function (cb) { uploadFile('mp4', id,  dstBucket, keyPrefix, 'video/mp4', cb); },
						function (cb) { uploadFile('png', null, dstBucket, keyPrefix, 'image/png', cb); }
					], cb);
				}
			], cb);
		}], function(err, results) {
		if (err) context.fail(err);
		else context.succeed(util.inspect(results, {depth: 5}));
	});
};