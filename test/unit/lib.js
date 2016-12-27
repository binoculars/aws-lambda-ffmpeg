import test from 'ava';
import path from 'path';

import {checkM3u} from '../../platform/lib';

const cwd = path.resolve(__dirname, '../fixtures');

test('Check for m3u8 with valid m3u8 file', async t => {
	try {
		await checkM3u('bad.mp4', cwd);
		t.fail('Promise did not reject');
	} catch (err) {
		t.pass();
	}
});

test('Check for m3u8 with valid mp4 file', async t => {
	try {
		await checkM3u('good.mp4', cwd);
		t.pass();
	} catch (err) {
		t.fail();
	}
});