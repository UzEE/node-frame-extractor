module.exports = function(grunt) {

	grunt.initConfig({

		pkg: grunt.file.readJSON('package.json'),
		lineending: {
			dist: {
				options: {
					eol: 'lf'
				},
				files: {
					"./bin/extract-frames.js": ["./extract-frames.js"]
				}
			}
		}
	});

	grunt.loadNpmTasks('grunt-lineending');

	grunt.registerTask('prepare', ['lineending']);
}