import test from 'ava';
import path from 'path';

import {checkM3u} from '../../platform/lib';

const cwd = path.resolve(__dirname, '../fixtures');

test('Check for m3u8 with valid m3u8 file', async t => {
	const error = await t.throws(checkM3u('bad.mp4', cwd));
	t.is(error, 'File looks like an M3U, bailing out');
});

test('Check for m3u8 with valid mp4 file', async t => {
	await t.notThrows(checkM3u('good.mp4', cwd));
});
