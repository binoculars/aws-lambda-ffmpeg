import {inspect} from 'util';
import {main} from '../common.js';
import * as lib from './lib.js';

const config = require(process.env.CONFIG_FILE || './config.json');

/**
 * The main handler for the AWS Lambda Function
 *
 * @param {Object} event - The S3 Event
 * @param {Object} context - The Lambda context
 * @param {requestCallback} callback
 */
export function handler(event, context, callback) {
	console.log(`Reading options from event:\n${inspect(event, {depth: 5})}`);

	main(lib, config, console, {
		event: event,
		context: context,
		callback: callback
	});
}