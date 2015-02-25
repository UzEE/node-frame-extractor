#!/usr/bin/env node

var path = require('path'),
	pkg;

if (require.main === module) {

	try {
		pkg = require(path.join(__dirname, '..', 'package.json'));
	}

	catch (e) {
		pkg = require(path.join(__dirname, 'package.json'));
	}

} else {
	pkg = require(path.join(__dirname, 'package.json'));
}

var fs = require('fs'),
	util = require('util'),
	async = require("async"),
	gm = require("gm"),
	AWS = require("aws-sdk"),
	child_process = require('child_process'),
	argv = require('yargs')
		.version(pkg.name + ", version: " + pkg.version + "\n", "version")
		.usage("\nExtracts adjecent frames from each scene in the given input video, and saves them in a new sub-directory called 'frames'.\n\nUsage: extract-frames -i [video] --fps [num] --frame-count [num] --data [scenes.json]")
		.example('extract-frames -i ./1.mp4 --data ./scenes.json', "Dump adjecent frames of all scenes in the file asuming a default framerate of 23.976")
		.example('extract-frames -i 1.mp4 -d scenes.json -f 29.97 -c 3 -p', "Dump six adjecent frames (three on either sides) of all scenes using a framerate of 29.97 and push them to the cloud storage.")
		.demand(['input'])
		.alias('i', 'input')
		.alias('d', 'data')
		.alias('r', 'fps')
		.alias('c', 'frame-count')
		.alias('t', 'concurrency')
		.alias('b', 'bucket')
		.alias('p', 'push-to-cloud')
		.alias('a', 'extract-all-frames')
		.alias('f', 'total-frames')
		.alias('v', 'video-id')
		.alias('o', 'out-directory-prefix')
		.default('d', null)
		.default('r', 23.976)
		.default('c', 5)
		.default('t', 8)
		.default('b', "ingrain.scenes.frames")
		.default('p', false)
		.default('a', false)
		.default('f', null)
		.default('v', null)
		.default('o', 'frames')
		.default('aws-profile', "default")
		.default('aws-region', "us-west-2")
		.default('verbose', false)
		.describe('i', 'Input video filename.')
		.describe('d', 'Scene data in Json format with a scene object having startFrame and endFrame keys.')
		.describe('r', 'Framerate of the input video. Must be accurate to extract scenes properly.')
		.describe('c', 'Number of frames to extract on either side of the scene. This is in addition to the frame marked in the scene boundry.')
		.describe('t', 'Number of concurrent sub-processes to use simultaneously. Should be used to tweak resource consumption. Use a value of 0 to run all sub-processes at once.')
		.describe('b', 'S3 Bucket to which the extracted frames will be pushed to.')
		.describe('p', 'Determines whether the extracted images be pushed to a cloud storage or not.')
		.describe('a', 'Extract all frames of the video. Requires --fps and --total-frames.')
		.describe('f', 'Total number of frames to extract from the video.')
		.describe('v', 'An identifier for the video being processed. It is used as an identifier in directory name.')
		.describe('o', 'Directory where the frames should be dumped. This directory will be deleted after uploading the frames if --push-to-cloud is used.')
		.describe('aws-profile', "Name of the AWS Credentials profile to use from the ~/.aws/credentials file.")
		.describe('aws-region', "Specify the AWS region to use.")
		.describe('verbose', "Prints detailed logs instead of simply showing progress in stdout.")
		.argv;

if (!fs.existsSync(argv.i)) {

	console.error("Error: Couldn't find the given input file: %s", argv.i);
	process.exit(1);
}

var data = undefined;

if (argv.data) {

	if (!fs.existsSync(argv.data)) {
	
		console.error("Error: Couldn't find the given scene data file: %s", argv.data);
		process.exit(1);

	} else {

		try {
			data = require(path.join(process.cwd(), argv.data));
		}

		catch (exp) {
			
			console.error("Error: Couldn't read the given scene data file: %s\nMake sure the file name is given in a format which can be parsed by CommonJS's require API.\nFor example: Use ./scenes.json instead of scenes.json.", argv.data);
			process.exit(1);	
		}
	}
}

var fps = Math.abs(argv.fps), 
	frameCount = Math.abs(argv.frameCount),
	s3Bucket = argv.bucket,
	pushToCloud = argv.pushToCloud,
	concurrency = argv.concurrency,
	totalFrames = argv.totalFrames,
	extractAllFrames = argv.extractAllFrames,
	videoId = argv.videoId || (data && data.videoId) || Math.round(Math.random() * 100000),
	verbose = argv.verbose,
	outDirPrexix = argv.outDirectoryPrefix;

var inputExt = path.extname(argv.i),
	inputName = path.basename(argv.i, inputExt);

var outDir = path.join(path.dirname(path.resolve(argv.i)), outDirPrexix + "." + videoId);

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir);
}

var failedFrames = [], 
	fileList = [], 
	fileCount = 0,
	pushCount = 0,
	totalPushCount = 0,
	ffmpegCmd = null;

var credentials = new AWS.SharedIniFileCredentials({profile: argv.awsProfile});

AWS.config.update({

	credentials: credentials,
	region: argv.awsRegion
});

var progressWeights = {

	extract: 20,
	listFiles: 3,
	process: 55,
	push: 15,
	processAndPush: 70,
	deleteImages: 5,
	deleteDir: 2
};

var totalProgress = 0;

var s3 = new AWS.S3();

var getTimeString = function (input) {

	var result = new Date(input * 1000);
	return result.getUTCHours() + ":" + result.getUTCMinutes() + ":" + result.getUTCSeconds() + "." + result.getUTCMilliseconds(); 
}

var buildFileName = function (dir, frame, videoId) {
	return dir + "/frame.keyframe." + frame + ".%003d.jpg";
}

var printLog = function () {

	if (verbose) {
		console.log.apply(this, arguments);
	}
}

var addPrevWeight = function (value, step) {

	value = parseFloat(value);

	switch (step) {

		case "deleteDir":
			
			value += progressWeights.deleteImages + progressWeights.process + progressWeights.listFiles + progressWeights.extract;
			break;

		case "deleteImages":
			
			value += progressWeights.push + progressWeights.process + progressWeights.listFiles + progressWeights.extract;
			break;

		case "processAndPush":
			
			value += progressWeights.listFiles + progressWeights.extract;
			break;

		case "push":
			
			value += progressWeights.process + progressWeights.listFiles + progressWeights.extract;
			break;

		case "process":
			
			value += progressWeights.listFiles + progressWeights.extract;
			break;

		case "listFiles":
			
			value += progressWeights.extract;
			break;

		case "extract":
			
			value += 0;
			break;
	}

	return value;
}

var printProgress = function (value, step) {

	//var progressStr = verbose ? "\n" : "";
	var progressStr = "";
	var adjustedWeight = 1;

	if (!pushToCloud) {
		adjustedWeight = 100 / (100 - (progressWeights.push + progressWeights.deleteImages + progressWeights.deleteDir));	
	}

	value = addPrevWeight(value * progressWeights[step], step);

	totalProgress = value * adjustedWeight;

	progressStr += "\033[0GProgress: " + totalProgress.toFixed(2) + "%";

	process.stdout.write(progressStr);
}

if (extractAllFrames && totalFrames) {
	ffmpegCmd = "ffmpeg -ss 00:00:00 -i " + argv.i + " -r " + fps + " -vframes " + totalFrames + " " + outDir + "/frame.%0" + totalFrames.toString().length + "d.jpg";
}

console.info("Starting the frame dump process in temporary directory: %s", outDir);
console.info("");

async.series([

	// Extract the frames
	function extractFramesFromVideo(cb) {

		if (!extractAllFrames) {

			async.eachLimit(

				data.frames,
				concurrency == 0 ? data.frames.length * 2 : concurrency,
				function (frame, callback) {

					var time = (frame - frameCount) / fps;
					var outName = buildFileName(outDir, frame, videoId);

					ffmpegCmd = "ffmpeg -ss " + getTimeString(time) + " -i " + argv.i + " -frames:v " + (frameCount * 2 + 1) + " " + outName;

					child_process.exec(

						ffmpegCmd, 
						function (err) {

							if (err) { 
								console.error(err); 
							}

							printProgress(++fileCount / data.frames, "extract");
							callback(err);
						}
					);
				},

				function (err) {

					printLog("All scenes have been dumped in the %s directory.", outDir);
					cb(err, true);
				}
			);

		} else {

			printProgress(0.15, "extract");

			child_process.exec(

				ffmpegCmd, 
				function (err) {

					if (err) { 

						console.error(err); 
						cb(err, false);

					} else {

						printLog("All scenes have been dumped in the %s directory.", outDir);

						printProgress(1, "extract");
						cb(null, true);
					}
				}
			);
		}
	},

	// Build a list of all files to process
	function listFilesToProcess(cb) {

		fs.readdir(outDir, function (err, files) {

			if (err) {

				console.error("Something went wrong.");
				console.error(err);
			
			} else {

				fileList = files;
				printProgress(1, "listFiles");
			}

			cb(err);
		});
	},

	// Process all the images with node-gm
	function processImages(cb) {

		printLog("Total images extracted: %d", fileList.length);
		printLog("Getting ready to process and resize %d images...", fileList.length);

		var processedCount = 0;

		async.eachLimit(

			fileList,
			concurrency == 0 ? fileList.length * 2 : concurrency,
			function (file, callback) {

				var fullPath = path.join(outDir, file);

				var proc = gm(fullPath)
					.resize(240)
					.noProfile();

				if (pushToCloud) {

					proc.stream("jpg", function (err, stdout, stderr) {

						if (err) {

							console.error("Something went wrong while processing the image.");
							console.error(err);
							return;
						}

						printProgress(++processedCount / (fileList.length * 2), "processAndPush");

						if (pushToCloud) {

							var nameArray = file.split('.');

							if (!extractAllFrames) {

								var keyframe = parseInt(nameArray[2]);
								var frameOffset = parseInt(nameArray[3]);

								var frameNumber = keyframe + frameOffset - (frameCount + 1);

								nameArray.splice(1, 2);
								nameArray[1] = frameNumber;

							} else {

								nameArray[1] = parseInt(nameArray[1]);
							}

							file = nameArray.join('.');

							var params = {
								
								Bucket: s3Bucket,
								Key: "video." + videoId + "/" + file,
								Body: stdout,
								ACL: "public-read",
								ContentType: "image/jpg"

							};

							s3.upload(params, function (err, data) {

								if (err) {

									console.error("Something went wrong while trying to upload '%s' to cloud storage.", file);
									console.error(err);
								
								} else {

									pushCount++;
									printProgress(++processedCount / (fileList.length * 2), "processAndPush");
								}

								callback(err);
								totalPushCount++;
							});
						}
					});

				} else {

					proc.write(fullPath, function (err) {

						if (err) {

							console.error("Something went wrong while processing the image.");
							console.error(err);
						}

						printProgress(++processedCount / fileList.length, "process");

						callback();
					});
				}
			},

			function (err) {

				if (!err) {

					printLog("Resized all the images in %s directory.", outDir);
					printProgress(1, "process");

				}

				cb(err);
			}
		);
	},

	// Push images to AWS S3
	function pushToS3(cb) {

		if (pushToCloud) {

			async.whilst(

				function () {
					return totalPushCount < fileList.length;
				},

				function (callback) {

					printLog("Pushed %d / %d files to cloud storage.", pushCount, fileList.length);
					setTimeout(callback, 1000);
				},

				function (err) {

					printProgress(1, "processAndPush");
					cb(err);
				}
			);

		} else {
			cb();
		}
	},

	// Delete the local images
	function deleteLocalImages(cb) {

		if (pushToCloud) {

			var deleteCount = 0;

			async.eachLimit(

				fileList,
				concurrency == 0 ? fileList.length * 2 : concurrency,
				function (file, callback) {

					var fullPath = path.join(outDir, file);

					fs.unlink(fullPath, function(err) {

						if (err) {

							console.error("Couldn't delete the file: %s", fullPath);
							console.error(err);
							return;
						}

						printProgress(++deleteCount / fileList.length, "deleteImages");
						callback();
					});
				},

				function(err) {

					printLog("Deleted all the temporary files in the %s directory", outDir);

					printProgress(1, "deleteImages");

					cb();
				}
			);

		} else {
			cb();
		}
	},

	// Delete the temporary directory
	function deleteTemporaryDirectory(cb) {

		if (pushToCloud && fs.existsSync(outDir)) {

			fs.rmdirSync(outDir);

			printLog("Removed the temporary %s directory", outDir);

			printProgress(1, "deleteDir");
		}

		console.log("\n");
		console.log("Finished the frame dump process.");

		cb();
	}
]);