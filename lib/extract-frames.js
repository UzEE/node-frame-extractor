var util = require('util'),
	async = require('async'),
	gm = require('gm'),
	fs = require('fs'),
	path = require('path'),
	child_process = require('child_process'),
	mkdirp = require('mkdirp');

module.exports = function frameExtractor(options) {

	// Define fields
	var self = this;

	self.config = null;
	self.files = null;

	// Define public methods
	self.init = function (opts) {

		self.config = {};

		self.config.mode = opts.mode || 'all';
		self.config.video = opts.inputVideo || null;
		self.config.videoId = opts.videoId || Math.round(Math.random() * 100000000);

		self.config.fps = opts.fps || 23.976;
		self.config.adjecentFrames = opts.adjecentFrames || 0;
		self.config.totalFrames = opts.totalFrames || null;

		self.config.concurrency = opts.concurrency || 8;

		if (opts.pushToCloud) {

			self.config.s3Bucket = opts.s3Bucket;
			self.config.pushToCloud = opts.pushToCloud;
		}

		self.config.outDirPrexix = opts.outDirPrexix || 'frames';

		self.config.outDir = path.join(path.dirname(path.resolve(self.config.video || process.cwd())), self.config.outDirPrexix + "." + self.config.videoId);
		mkdirp.sync(self.config.outDir);
	};

	self.extract = function (data, cb) {

		if (self.config.mode === 'all') {
			extractAllFrames(cb);
		} else {
			extractFrames(data, cb);
		}
	};

	// Define private methods
	var extractAllFrames = function (cb) {

		if (!self.config) {
			return cb(new Error('No configuration set for extraction. Please call .init(options) first.'));
		}

		var inputStr = '-i ' + self.config.video;

		if (self.config.fps) {
			inputStr += ' -r ' + self.config.fps;
		}

		if (self.config.totalFrames) {
			inputStr += ' -vframes ' + self.config.totalFrames;
		}

		var ffmpegArgs = [
			inputStr,
			self.config.outDir + '/frame.%0' + Math.min(self.config.totalFrames, 1000000).toString().length + 'd.jpg'
		];

		child_process.exec('ffmpeg ' + ffmpegArgs.join(' '), function extractionComplete (err) {

			if (err > 0) {
				return cb(err);
			}

			fs.readdir(self.config.outDir, function directoryRead (err, files) {

				if (err) {
					return cb(err);
				}

				files = files.map(function mapFiles(file) {
					return self.config.outDir + '/' + file;
				});

				self.files = files;
				return cb(null, files);
			})
		});
	};

	var extractFrames = function (frames, cb) {

		if (self.config.adjecentFrames) {

			frames = frames.map(function shiftFrameNumbers(frame) {
				return Math.max(frame - self.config.adjecentFrames, 0);
			});
		}

		var frameLength = Math.max.apply(Math, frames).toString().length;

		async.eachLimit(

			frames,
			self.config.concurrency,
			function extractFrame(frame, callback) {

				var time = frame / self.config.fps;
				var outName = buildFileName(frame, frameLength);

				var ffmpegArgs = [
					'-ss', getTimeString(time),
					'-i', self.config.video,
					'-frames:v', self.config.adjecentFrames * 2 + 1,
					outName
				];

				var proc = child_process.spawn('ffmpeg', ffmpegArgs);

				proc.on('close', function extractionComplete (code) {

					if (code > 0) {
						return callback(new Error('ffmpeg exited with code: ' + code));
					}

					return callback(null, true);
				});
			},
			function extractionComplete (err) {

				if (err) {
					return cb(err);
				}

				fs.readdir(self.config.outDir, function (err, files) {

					if (err) {
						return cb(err);
					}

					var newFiles = [];

					async.each(

						files,
						function renameFile (file, callback) {
							var parts = file.split('.');
							var frame = parseInt(parts[1]) + parseInt(parts[2]) - 1;

							parts.splice(1, 1);
							parts[1] = zeroPadLeft(frame, frameLength);

							var newName = self.config.outDir + '/' + parts.join('.');

							fs.rename(self.config.outDir + '/' + file, newName, function (err) {

								if (err) {
									return callback(err);
								}

								newFiles.push(newName);
								return callback(null, true);
							});
						},
						function filesRenamed (err) {

							if (err) {
								return cb(err);
							}

							self.files = newFiles;
							return cb(null, newFiles);
						}
					);
				});
			}
		);
	};

	var buildFileName = function (frame, frameLength) {
		return self.config.outDir + '/frame.' + frame + '.%0' + frameLength + 'd.jpg';
	};

	var getTimeString = function (input) {

		var result = new Date(input * 1000);
		return result.getUTCHours() + ":" + result.getUTCMinutes() + ":" + result.getUTCSeconds() + "." + result.getUTCMilliseconds(); 
	};

	var zeroPadLeft = function (number, zeros) {

		var abs = Math.abs(number);
		var digitCount = 1 + Math.floor(Math.log(abs) / Math.LN10);

		if (digitCount >= zeros) {
			return number;
		}

		var zeroString = Math.pow(10, zeros - digitCount).toString().substr(1);
		return number < 0 ? '-' + zeroString + abs : zeroString + abs;
	};

	// Define bootstrap logic
	if (options) {

		self.init(options);

	} else {
		self.init({});
	}
};