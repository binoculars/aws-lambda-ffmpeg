import {inspect} from 'util';
import {main} from '../common.js';
import * as lib from './lib.js';

const config = require(process.env.CONFIG_FILE || './config.json');

/**
 * The main Microsoft Azure Function
 *
 * @param {Object} context - The event context
 * @param {Object} data - The event data
 */
export function ffmpeg(context, data) {
	console.log(`Reading options from event:\n${inspect(event, {depth: 5})}`);

	main(lib, config, context, {
		event: data,
		context: context,
		callback: context.done
	});
};