#!/usr/bin/env node

var fs = require('fs'),
	path = require('path'),
	async = require("async"),
	gm = require("gm"),
	pkg = require(path.join(__dirname, 'package.json')),
	child_process = require('child_process'),
	argv = require('yargs')
		.version(pkg.name + ", version: " + pkg.version + "\n", "version")
		.usage("Extracts adjecent frames from each scene in the given input video, and saves them in a new sub-directory called 'frames'.\nUsage: extract-frames -i [video] --fps [num] --frame-count [num] --data [scenes.json]")
		.example('extract-frames -i ./1.mp4 --data ./scenes.json', "Dump adjecent frames of all scenes in the file asuming a default framerate of 23.976")
		.demand(['i', 'd'])
		.alias('i', 'input')
		.alias('d', 'data')
		.alias('f', 'fps')
		.alias('c', 'frame-count')
		.default('f', 23.976)
		.default('c', 5)
		.describe('i', 'Input video filename.')
		.describe('d', 'Scene data in Json format with a scene object having startFrame and endFrame keys.')
		.describe('f', 'Framerate of the input video. Must be accurate to extract scenes properly.')
		.describe('c', 'Number of frames to extract on either side of the scene. This is in addition to the frame marked in the scene boundry.')
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

var fps = argv.fps || 23.976, 
	frameCount = Math.abs(argv.frameCount) || 6530;

var inputExt = path.extname(argv.i);
var inputName = path.basename(argv.i, inputExt);

var outDir = path.join(path.dirname(path.resolve(argv.i)), "frames");

if (!fs.existsSync(outDir)) {
	fs.mkdirSync(outDir);
}

var outDir = path.basename(outDir);
var fileList = [], fileCount = 0;

var getTimeString = function(input) {

	var result = new Date(input * 1000);
	return result.getUTCHours() + ":" + result.getUTCMinutes() + ":" + result.getUTCSeconds() + "." + result.getUTCMilliseconds(); 
}

var buildFileName = function(dir, index, frame) {
	return dir + "/scene-" + index + "-keyframe-" + frame + "-frame-%003d.jpg";
}

var execExtractCmd = function(time, input, count, name, cb) {

	child_process.exec(

		"ffmpeg -ss " + getTimeString(time) + " -i " + input + " -frames:v " + (count * 2 + 1) + " " + name,
		
		function(err) {

			cb(err);
		}
	);
}

async.series([

	// Extract the frames
	function(cb) {

		async.each(

			data,
			function(scene, callback) {

				var time, outName;

				async.parallel([

					function(parCb) {

						time = (scene.startFrame - frameCount) / fps;
						outName = buildFileName(outDir, scene.sceneNumber, scene.startFrame);

						execExtractCmd(time, argv.i, frameCount, outName, function(err) {

							fileCount++;
							parCb(err);
						});					
					},

					function(parCb) {

						time = (scene.endFrame - frameCount) / fps;
						outName = buildFileName(outDir, scene.sceneNumber, scene.endFrame);

						execExtractCmd(time, argv.i, frameCount, outName, function(err) {
							
							fileCount++;
							parCb(err);
						});					
					},
				],

				function() {
					callback();
				});
			},

			function(err) {

				console.info("All scenes have been dumped in the ./frames/ directory.");
				cb(err, true);
			}
		);
	},

	// Build a list of all files to process
	function(cb) {

		fs.readdir(outDir, function(err, files) {

			console.log(fileList.length);
		});
	}
]);