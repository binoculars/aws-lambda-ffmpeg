const azureFunction = require('../platform/msa/index.js').ffmpeg;
const event = require('../event/msa.json');

const context = {
	/**
	 * Bindings
	 *
	 * @type Object
	 */
	bindings: {},

	/**
	 * The logger function
	 * @type function
	 */
	log: console.log,

	/**
	 * The callback
	 *
	 * @param error
	 * @param propertyBag
	 */
	done: function(error, propertyBag) {
		if (error) {
			console.error(error);
			process.exit(1);
		} else {
			console.log(propertyBag);
			process.exit();
		}
	}
};

azureFunction(context, event);