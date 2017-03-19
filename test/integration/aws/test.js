import test from 'ava';
import fs from 'fs';
import path from 'path';

import AWS from 'aws-sdk';

const cloudFormation = new AWS.CloudFormation();
const cloudWatchLogs = new AWS.CloudWatchLogs();
const s3 = new AWS.S3();

const {
	STACK_NAME: StackName,
	BUCKET_PREFIX: bucketPrefix
} = process.env;

const sourceBucket = `${bucketPrefix}-src`;
const destinationBucket = `${bucketPrefix}-dst`;

test('Test the Lambda function', async t => {
	let startTime = Date.now();

	const [{StackResourceDetail: {PhysicalResourceId}}] = await Promise
		.all([
			cloudFormation
				.describeStackResource({
					StackName,
					LogicalResourceId: 'Lambda'
				})
				.promise(),
			s3
				.putObject({
					Bucket: sourceBucket,
					Key: 'test.mp4',
					Body: fs.createReadStream(
						path.join(
							__dirname,
							'../../fixtures/good.mp4'
						)
					)
				})
				.promise()
		]);

	await new Promise(resolve => {
		let interval;

		async function printEvents() {
			const {events} = await cloudWatchLogs
				.filterLogEvents({
					logGroupName: `/aws/lambda/${PhysicalResourceId}`,
					startTime,
					interleaved: false
				})
				.promise();

			for (const {message} of events) {
				console.log(message.trim());

				if (/^REPORT/.test(message)) {
					clearInterval(interval);
					return resolve();
				}
			}

			if (events.length)
				startTime = events[events.length - 1].timestamp + 1;
		}

		interval = setInterval(printEvents, 3e3);
	});

	try {
		await Promise
			.all([
				['test.mp4', 'video/mp4'],
				['test.png', 'image/png']
			].map(async([Key, expected]) => {
				const {ContentType} = await s3
					.headObject({
						Bucket: destinationBucket,
						Key
					})
					.promise();

				t.is(ContentType, expected, 'Result object does not exist');
			}));
	} catch(error) {
		t.fail('One or more objects does not exist');
	}

	await Promise
		.all([
			s3
				.deleteObject({
					Bucket: sourceBucket,
					Key: 'test.mp4'
				})
				.promise(),
			s3
				.deleteObjects({
					Bucket: destinationBucket,
					Delete: {
						Objects: [
							'test.mp4',
							'test.png'
						].map(Key => ({Key}))
					}
				})
				.promise()
		]);
});
