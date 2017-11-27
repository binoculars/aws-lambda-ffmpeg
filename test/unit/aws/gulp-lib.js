import test from 'ava';

import {stackEventToRow} from '../../../platform/aws/gulp-lib';
import chalk from 'chalk';

const lineWidth = 128;

test('A one-line event', t => {
	const stackEvent = {
		Timestamp: new Date(0),
		ResourceStatus: 'CREATE_IN_PROGRESS',
		ResourceType: 'AWS::CloudFormation::Stack',
		LogicalResourceId: 'username-aws-lambda-ffmpeg-tag-v240'
	};

	const actual = stackEventToRow(stackEvent);
	const expected = `
│ 1970-01-01T00:00:00.000Z │ ${chalk.yellow('CREATE_IN_PROGRESS')} │ AWS::CloudFormation::Stack │ username-aws-lambda-ffmpeg-tag-v240   │
`.trim();

	t.is(actual, expected);

	for (const line of actual.split('\n'))
		t.is(line.length, lineWidth);
});

test('A multi-line event', t => {
	const stackEvent = {
		Timestamp: new Date(0),
		ResourceStatus: 'UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS',
		ResourceType: 'AWS::CloudFormation::Stack',
		LogicalResourceId: 'username-aws-lambda-ffmpeg-branch-master'
	};

	const actual = stackEventToRow(stackEvent);
	const expected = `
│ 1970-01-01T00:00:00.000Z │ ${chalk.red('UPDATE_ROLLBACK_CO')} │ AWS::CloudFormation::Stack │ username-aws-lambda-ffmpeg-branch-mas │
│                          │ ${chalk.red('MPLETE_CLEANUP_IN_')} │                            │ ter                                   │
│                          │ ${chalk.red('PROGRESS          ')} │                            │                                       │
`.trim();

	t.is(actual, expected);

	for (const line of actual.split('\n'))
		t.is(line.length, lineWidth);
});
