import {inspect} from 'util';
import {main} from '../common.js';
import * as lib from './lib.js';

/**
 * The main Microsoft Azure Function
 *
 * @param {Object} context - The event context
 * @param {Object} data - The event data
 */
export function ffmpeg(context, data) {
	console.log(`Reading options from event:\n${inspect(event, {depth: 5})}`);

	main(lib, context, {
		event: data,
		context: context,
		callback: context.done
	});
};