#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const dirs = [
	'config',
	'event'
];

for (const dir of dirs) {
	if (fs.existsSync(dir))
		continue;

	const samplesDir = `${dir}_samples`;
	const samples = fs.readdirSync(samplesDir);

	console.log(`Creating ${dir}/ directory from ${samplesDir}/ directory`);
	fs.mkdirSync(dir);

	for (const sample of samples) {
		fs.createReadStream(
			path.join(samplesDir, sample)
		)
			.pipe(
				fs.createWriteStream(
					path.join(dir, sample)
				)
			);
	}
}