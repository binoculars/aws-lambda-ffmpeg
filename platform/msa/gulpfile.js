var path = require('path');
var runSequence = require('run-sequence');
var jeditor = require("gulp-json-editor");
var child_process = require('child_process');

var config;
try {
	config = require(path.join(__dirname, 'config.json'));
} catch (ex) {
	config = {};
}

module.exports = function(gulp, prefix) {

};