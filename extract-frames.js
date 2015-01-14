#!/usr/bin/env node

var fs = require('fs'),
	path = require('path'),
	util = require('util'),
	async = require("async"),
	gm = require("gm"),
	AWS = require("aws-sdk"),
	pkg = require(path.join(__dirname, 'package.json')),
	child_process = require('child_process'),
	argv = require('yargs')
		.version(pkg.name + ", version: " + pkg.version + "\n", "version")
		.usage("\nExtracts adjecent frames from each scene in the given input video, and saves them in a new sub-directory called 'frames'.\n\nUsage: extract-frames -i [video] --fps [num] --frame-count [num] --data [scenes.json]")
		.example('extract-frames -i ./1.mp4 --data ./scenes.json', "Dump adjecent frames of all scenes in the file asuming a default framerate of 23.976")
		.example('extract-frames -i 1.mp4 -d scenes.json -f 29.97 -c 3 -p', "Dump six adjecent frames (three on either sides) of all scenes using a framerate of 29.97 and push them to the cloud storage.")
		.demand(['i', 'd'])
		.alias('i', 'input')
		.alias('d', 'data')
		.alias('f', 'fps')
		.alias('c', 'frame-count')
		.alias('t', 'concurrency')
		.alias('b', 'bucket')
		.alias('p', 'push-to-cloud')
		.default('f', 23.976)
		.default('c', 5)
		.default('t', 8)
		.default('b', "ingrain.scenes.frames")
		.default('p', false)
		.default('aws-profile', "default")
		.describe('i', 'Input video filename.')
		.describe('d', 'Scene data in Json format with a scene object having startFrame and endFrame keys.')
		.describe('f', 'Framerate of the input video. Must be accurate to extract scenes properly.')
		.describe('c', 'Number of frames to extract on either side of the scene. This is in addition to the frame marked in the scene boundry.')
		.describe('t', 'Number of concurrent sub-processes to use simultaneously. Should be used to tweak resource consumption. Use a value of 0 to run all sub-processes at once.')
		.describe('b', 'S3 Bucket to which the extracted frames will be pushed to.')
		.describe('p', 'Determines whether the extracted images be pushed to a cloud storage or not.')
		.describe('aws-profile', "Name of the AWS Credentials profile to use from the ~/.aws/credentials file.")
		.argv;

if (!fs.existsSync(argv.i)) {

	console.error("Error: Couldn't find the given input file: %s", argv.i);
	process.exit(1);
}

if (!fs.existsSync(argv.data)) {
	
	console.error("Error: Couldn't find the given scene data file: %s", argv.data);
	process.exit(1);
}

var data;

try {
	data = require(path.join(process.cwd(), argv.data));
}

catch (exp) {
	
	console.error("Error: Couldn't read the given scene data file: %s\nMake sure the file name is given in a format which can be parsed by CommonJS's require API.\nFor example: Use ./scenes.json instead of scenes.json.", argv.data);
	process.exit(1);	
}

var fps = Math.abs(argv.fps), 
	frameCount = Math.abs(argv.frameCount),
	s3Bucket = argv.bucket,
	pushToCloud = argv.pushToCloud,
	concurrency = argv.concurrency;

var inputExt = path.extname(argv.i),
	inputName = path.basename(argv.i, inputExt);

var outDir = path.join(path.dirname(path.resolve(argv.i)), "frames");

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir);
}

var outDir = path.basename(outDir),
	sceneList = [], 
	fileList = [], 
	fileCount = 0
	pushCount = 0,
	totalPushCount = 0,
	videoId = data.videoId;

var credentials = new AWS.SharedIniFileCredentials({profile: argv.awsProfile});

AWS.config.update({

	credentials: credentials,
	region: "us-west-2"
});

var s3 = new AWS.S3();

var getTimeString = function (input) {

	var result = new Date(input * 1000);
	return result.getUTCHours() + ":" + result.getUTCMinutes() + ":" + result.getUTCSeconds() + "." + result.getUTCMilliseconds(); 
}

var buildFileName = function (dir, frame) {
	return dir + "/frame.keyframe." + frame + ".frame.%003d.jpg";
}

data.scenes.forEach(function (scene, index) {

	index++;

	sceneList.push({
		
		id: scene.id,
		index: index,
		frame: scene.startFrame
	});

	sceneList.push({
		
		id: scene.id,
		index: index,
		frame: scene.endFrame
	});
});

console.log("Starting the process...");

async.series([

	// Extract the frames
	function (cb) {

		async.eachLimit(

			sceneList,
			concurrency == 0 ? sceneList.length * 2 : concurrency,
			function (scene, callback) {

				var time = (scene.frame - frameCount) / fps;
				var outName = buildFileName(outDir, scene.frame);

				child_process.exec(

					"ffmpeg -ss " + getTimeString(time) + " -i " + argv.i + " -frames:v " + (frameCount * 2 + 1) + " " + outName, 
					function (err) {

						if (err) { 
							console.log(err); 
						}

						fileCount++;
						callback(err);
					}
				);
			},

			function (err) {

				console.info("All scenes have been dumped in the ./frames/ directory.");
				cb(err, true);
			}
		);
	},

	// Build a list of all files to process
	function (cb) {

		fs.readdir(outDir, function (err, files) {

			if (err) {

				console.error("Something went wrong.");
				console.log(err);
			
			} else {

				fileList = files;
			}

			cb(err);
		});
	},

	// Process all the images with node-gm
	function (cb) {

		console.log("Total images extracted: %d", fileList.length);
		console.log("Getting ready to process and resize %d images...", fileList.length);

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
							console.log(err);
						}

						if (pushToCloud) {

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
									console.log(err);
								
								} else {

									pushCount++;
								}

								totalPushCount++;
							});
						}

						callback();
					});

				} else {

					proc.write(fullPath, function (err) {

						if (err) {

							console.error("Something went wrong while processing the image.");
							console.log(err);
						}

						callback();
					});
				}
			},

			function (err) {

				if (!err) {

					console.log("Resized all the images in ./frames/ directory.");
				}

				cb(err);
			}
		);
	},

	// Push images to AWS S3
	function (cb) {

		if (pushToCloud) {

			async.whilst(

				function () {
					return totalPushCount < fileList.length;
				},

				function (callback) {

					console.log("Pushed %d / %d files to cloud storage.", pushCount, fileList.length);
					setTimeout(callback, 1000);
				},

				function (err) {
					cb(err);
				}
			);
		}
	},

	// Delete the local images
	function (cb) {

		if (pushToCloud) {

			async.eachLimit(

				fileList,
				concurrency == 0 ? fileList.length * 2 : concurrency,
				function (file, callback) {

					var fullPath = path.join(outDir, file);

					fs.unlink(fullPath, function(err) {

						if (err) {

							console.error("Couldn't delete the file: %s", fullPath);
							console.log(err);
						}

						callback();
					});
				},

				function(err) {

					console.log("Deleted all the temporary files in the ./frames/ directory");

					cb();
				}
			);
		}
	}
]);