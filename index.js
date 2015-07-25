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

process.env['PATH'] += ':' + process.env['LAMBDA_TASK_ROOT'];

function downloadStream(bucket, file, cb) {
	console.log('Starting download');

	return s3.getObject({
		Bucket: bucket,
		Key: file
	}).on('error', function(res) {
		cb('S3 download error: ' + JSON.stringify(res));
	}).createReadStream();
}

function s3upload(params, filename, cb) {
	s3.upload(params)
		.on('httpUploadProgress', function(evt) {
			console.log(filename, 'Progress:', evt.loaded, '/', evt.total);
		})
		.send(cb);
}

function uploadFile(fileExt, id, bucket, keyPrefix, contentType, cb) {
	console.log('Uploading', contentType);

	var filename = '/tmp/out.' + fileExt;
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
				return cb(null, readStream);

			var gzipFilename = filename + '.gzip';
			var md5 = crypto.createHash('md5');
			var md5pass = new stream.PassThrough;
			var s3pass = new stream.PassThrough;

			rmFiles.push(gzipFilename);
			params.ContentEncoding = 'gzip';
			readStream.pipe(md5pass);
			readStream.pipe(s3pass);

			s3pass
				.pipe(zlib.createGzip({level: zlib.Z_BEST_COMPRESSION}))
				.pipe(fs.createWriteStream(gzipFilename));

			md5pass
				.on('data', function(d) {
					md5.update(d);
				})
				.on('end', function() {
					var digest = md5.digest();
					params.Metadata = {'md5': digest.toString('hex')};
					cb(null, fs.createReadStream(gzipFilename));
				});
		},
		function(fstream, cb) {
			params.Body = fstream;
			s3upload(params, filename, cb);
		},
		function(data, cb) {
			console.log(filename, 'complete. Deleting now.');
			async.each(rmFiles, fs.unlink, cb);
		}
	], cb);
}

function ffprobeVerify(cb) {
	console.log('starting ffprobe');

	var ffprobe = child_process.execFile(
		'ffprobe',
		[
			'-v', 'quiet',
			'-print_format', 'json',
			'-show_format',
			'-show_streams',
			'-i', '-'
		],
		{
			cwd: '/tmp',
			stdio: [null, null, null, 'pipe']
		}
	);

	var output = '';

	ffprobe.stdout.on('data', function (data) {
		output += data;
	});

	ffprobe.stdin.on('error', function() {
		// Handling EPIPE errors. This is a weird, unfixed bug... apparently
		// https://github.com/joyent/node/issues/7481
		console.log('ffprobe stdin error');
	});

	ffprobe.on('exit', function(code, signal) {
		console.log('ffprobe done');

		if (code)
			return cb('ffprobe Error code: ' + code + ', signal: ' + signal);
		else {
			var outputObj = JSON.parse(output);
			var maxDuration = config.videoMaxDuration;

			var hasVideoStream = outputObj.streams.some(function(stream) {
				return stream.codec_type === 'video' && stream.duration <= maxDuration;
			});

			if (!hasVideoStream)
				return cb('no valid video stream found');
			else {
				console.log('valid video stream found');
				return cb(null, 'ffprobe finished');
			}
		}
	});

	return ffprobe;
}

function ffmpegProcess(description, cb) {
	console.log('starting ffmpeg');

	var ffmpeg = child_process.execFile(
		'ffmpeg',
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
			return cb('ffmpeg Error code: ' + code + ', signal: ' + signal);
		else
			cb(null, 'ffmpeg finished');
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
	var dlFile = '/tmp/download';

	async.series([
		function(cb) {
			var dlStream = downloadStream(s3Event.bucket.name, srcKey, cb);
			dlStream.on('end', function() {
				cb(null, 'download finished');
			});
			dlStream.pipe(fs.createWriteStream(dlFile));
		},
		function(cb) {
			fs.createReadStream(dlFile).pipe(ffprobeVerify(cb).stdin);
		},
		function(cb) {
			fs.createReadStream(dlFile).pipe(ffmpegProcess(config.linkPrefix + buffer2shorturl(id), cb).stdin);
		},
		function(cb) {
			console.log('Deleting download file');
			fs.unlink(dlFile, cb);
		}
	], cb);
}

exports.handler = function(event, context) {
	console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));

	var s3Event = event.Records[0].s3;
	var srcKey = decodeURIComponent(s3Event.object.key);
	var keyPrefix = srcKey.replace(/\.[^/.]+$/, '');
	// Key structure on source bucket is 3 folders deep with a UUID filename
	var id = new Buffer(uuid.parse(keyPrefix.split('/').pop()));

	async.series([
		function (cb) { processVideo(s3Event, srcKey, id, cb); },
		function (cb) {
			var dstBucket = config.destinationBucket;
			async.parallel([
				function (cb) { uploadFile('mp4', id,  dstBucket, keyPrefix, 'video/mp4', cb); },
				function (cb) { uploadFile('png', null, dstBucket, keyPrefix, 'image/png', cb); }
			], cb);
		}
	], function(err, results) {
		if (err) context.fail(err);
		else context.succeed(results);
	});
};