var util = require('util'),
	async = require('async'),
	gm = require('gm'),
	child_process = require('child_process');

module.exports = function frameExtractor(options) {

	// Define fields
	var self = this;

	self.config = null;

	// Define public methods
	self.init = function (opts) {

		self.config = {};

		self.config.mode = opts.mode || 'all';
		self.config.video = opts.inputVideo || null;
		self.config.videoId = opts.videoId || Math.round(Math.random() * 100000000);

		self.config.fps = opts.fps || 23.976;
		self.config.frameCount = opts.frameCount || 5;
		self.config.totalFrames = opts.totalFrames || null;

		self.config.concurrency = opts.concurrency || 8;

		if (opts.pushToCloud) {

			self.config.s3Bucket = opts.s3Bucket;
			self.config.pushToCloud = opts.pushToCloud;
		}

		
	};

	self.extract = function (data) {

		if (self.config.mode === 'all') {

			self._extractAllFrames();

		} else {
			self._extractFrames(data);
		}
	};

	// Define private methods
	self._extractAllFrames = function (cb) {

		if (!self.config) {
			return cb(new Error('No configuration set for extraction. Please call .init(options) first.'));
		}

		var ffmpegArgs = [
			'-ss', '00:00:00',
			'-i', self.config.video,
			'-r', self.config.fps, 
			'-vframes', self.config.totalFrames,
			self.config.outDir + '/frame.%0' + self.config.totalFrames.toString().length + 'd.jpg'
		];

		child_process.spawn('ffmpeg', function extractionComplete(err) {

			if (err) {
				return cb(err);
			}

			return cb(null, true);
		});
	};

	self._extractFrames = function (frames, cb) {


	};

	// Define bootstrap logic
	if (options) {
		self.init(options);
	}
};