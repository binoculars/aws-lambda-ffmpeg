const util = require('util');
const cloudFunction = require('../platform/gcp/index.js').entryPoint;
const data = require('../event/gcp.json');

/**
 * See https://cloud.google.com/functions/writing
 * 
 * @type {{success: context.success, failure: context.failure, done: context.done}}
 */
const context = {
	/**
	 * Called when your function completes successfully. An optional message argument may be passed to success that
	 * will be returned when the function is executed synchronously.
	 *
	 * @type {function}
	 * @param {string} [message]
	 */
	success: function(message) {
		console.log('Succeeded:', util.inspect(message, {depth: 5}));
		process.exit();
	},

	/**
	 * Called when your function completes unsuccessfully. An optional message argument may be passed to failure that
	 * will be returned when the function is executed synchronously.
	 *
	 * @type {function}
	 * @param {string} [message]
	 */
	failure: function (message) {
		console.error('Failed:', message);
		process.exit(1);
	},

	/**
	 * Short-circuit function that behaves like success when no message argument is provided, and behaves like failure
	 * when a message argument is provided.
	 *
	 * @type {function}
	 * @param {string} [message]
	 */
	done: function(message) {
		if (message)
			context.failure(message);
		else
			context.success();
	}
};

cloudFunction(context, data);