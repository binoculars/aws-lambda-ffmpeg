const fs = require('fs');
const path = require('path');

[
	'config',
	'event'
]
	.filter(dir => {
		try {
			fs.accessSync(dir);
			return false;
		} catch(e) {
			return true;
		}
	})
	.forEach(dir => {
		const samplesDir = `${dir}_samples`;

		fs.mkdirSync(dir);
		fs.readdirSync(samplesDir)
			.forEach(sample => fs
				.createReadStream(
					path.join(samplesDir, sample)
				)
				.pipe(
					fs.createWriteStream(
						path.join(dir, sample)
					)
				)
			);
	});