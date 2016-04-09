process.env['NODE_ENV'] = 'production';

var child_process = require('child_process');
var fs = require('fs');
var zlib = require('zlib');
var path = require('path');
var async = require('async');
var tempDir = process.env['TEMP'] || require('os').tmpdir();

exports.main = function(library, config, invocation) {
	var sourceLocation = library.getFileLocation(invocation.event);
	var keyPrefix = sourceLocation.key.replace(/\.[^/.]+$/, '');
	var dlFile = path.join(tempDir, 'download');
	var description = config.linkPrefix + '/' + sourceLocation.key + '.' + config.format.video.extension;
	var scaleFilter = "scale='min(" + config.videoMaxWidth.toString() + "\\,iw):-2'";
	
	async.series([
		function(cb) {
			var dlStream = library.getDownloadStream(sourceLocation.bucket, sourceLocation.key, cb);

			dlStream.on('end', function() {
				cb(null, 'download finished');
			});

			dlStream.pipe(fs.createWriteStream(dlFile));
		},
		function(cb) {
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
				function(err, stdout) {
					if (err) return cb(err);

					var outputObj = JSON.parse(stdout);
					var maxDuration = config.videoMaxDuration;

					var hasVideoStream = outputObj.streams.some(function(stream) {
						return stream.codec_type === 'video' &&
							(stream.duration || outputObj.format.duration) <= maxDuration;
					});

					if (!hasVideoStream)
						return cb('FFprobe: no valid video stream found');
					else {
						console.log('Valid video stream found', stdout);
						return cb(err, 'FFprobe finished');
					}
				}
			);
		},
		function(cb) {
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
				cb
			);
		},
		function(cb) {
			console.log('Deleting download file');
			fs.unlink(dlFile, cb);
		},
		function(cb) {
			async.map(
				Object.keys(config.format),
				function(type, cb) {
					var format = config.format[type];
					var filename = path.join(tempDir, 'out.' + format.extension);
					var rmFiles = [filename];
					var readStream = fs.createReadStream(filename);
					var key = [keyPrefix, format.extension].join('.');
					var contentEncoding = null;

					console.log('Uploading', format.mimeType);

					async.waterfall([
						function(cb) {
							if (!config.gzip)
								return cb(null, readStream);

							contentEncoding = 'gzip';
							var gzipFilename = filename + '.gzip';

							rmFiles.push(gzipFilename);

							var gzipWriteStream = fs.createWriteStream(gzipFilename);

							gzipWriteStream.on('finish', function() {
								cb(null, fs.createReadStream(gzipFilename));
							});

							readStream
								.pipe(zlib.createGzip({level: zlib.Z_BEST_COMPRESSION}))
								.pipe(gzipWriteStream);
						},
						function(fileStream, cb) {
							library.uploadToBucket(
								config.destinationBucket,
								key,
								fileStream,
								contentEncoding,
								format.mimeType,
								cb
							);
						},
						function(data, cb) {
							console.log(filename, 'complete. Deleting now.');
							async.each(rmFiles, fs.unlink, cb);
						}
					], cb);
				},
				cb
			);
		}
	], invocation.callback);
};