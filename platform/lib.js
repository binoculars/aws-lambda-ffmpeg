import {spawn} from 'child_process';

export function checkM3u(file, cwd) {
	return new Promise((resolve, reject) =>
		spawn(
			'grep',
			['^#EXT', file],
			{
				cwd
			}
		)
			.on('close', code =>
				code === 0 ? reject(code) : resolve(code)
			)
	);
}