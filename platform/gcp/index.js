import {inspect} from 'util';
import {main} from '../common.js';
import * as lib from './lib.js';

const config = require(process.env.CONFIG_FILE || './config.json');

/**
 * The main Google Cloud Function
 * 
 * @param {Object} context - The event context
 * @param {Object} data - The event data
 */
export function entryPoint(context, data) {
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