var util = require('util');
var lib = require('./lib.js');
var config = require('./config.json');
var common = require('../common.js');

/**
 * The main Google Cloud Function
 * 
 * @param {Object} context - The event context
 * @param {Object} data - The event data
 */
exports.ffmpeg = function(context, data) {
	console.log("Reading options from data:\n", util.inspect(data, {depth: 5}));

	common.main(lib, config, console, {
		event: data,
		context: context,
		// Shim
		callback: function(error, result) {
			if (error)
				context.failure(error);
			else
				context.succeed(result);
		}
	});
};