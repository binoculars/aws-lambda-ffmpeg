import {inspect} from 'util';
import {main} from '../common.js';
import * as lib from './lib.js';

/**
 * The main Google Cloud Function
 * 
 * @param {Object} context - The event context
 * @param {Object} data - The event data
 */
export function entryPoint(context, data) {
	console.log(`Reading options from data:\n${inspect(data, {depth: 5})}`);

	main(lib, console, {
		event: data,
		context: context,
		// Shim
		callback: (error, result) => {
			if (error)
				context.failure(error);
			else
				context.success(result);
		}
	});
}