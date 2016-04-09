var util = require('util');
var lib = require('./lib.js');
var config = require('./config.json');
var common = require('../common.js');

/**
 * The main handler for the AWS Lambda Function
 *
 * @param {Object} event - The S3 Event
 * @param {Object} context - The Lambda context
 */
exports.handler = function(event, context) {
	console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));

	common.main(lib, config, {
		event: event,
		context: context,
		callback: context.done
	});
};