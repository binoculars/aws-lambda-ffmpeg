import {inspect} from 'util';
import {main} from '../common.js';
import * as lib from './lib.js';

/**
 * The main Google Cloud Function
 * 
 * @param {Object} event - The event as defined at https://cloud.google.com/functions/docs/writing/background
 * @param {Function} callback - The callback, conforms to the errback convention
 */
export function entryPoint(event, callback) {
	console.log(`Reading options from data:\n${inspect(event, {depth: 5})}`);

    const file = event.data;
    const isDelete = file.resourceState === 'not_exists';

    if (isDelete) {
        console.log(`File ${file.name} deleted.`);
        callback();
    } else {
        console.log(`File ${file.name} uploaded.`);
        main(lib, console, {
            event: file,
            callback: callback
        });
    }

}
