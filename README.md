# Description
An [AWS Lambda](http://aws.amazon.com/lambda/) function that resizes videos and outputs thumbnails using [FFmpeg](https://www.ffmpeg.org/).

## Setup
1. Install node.js, preferably through [nvm](/creationix/nvm). Lambda uses an older version of node (currently v0.10.33), so it would be best use the same version--especially when installing dependencies via npm.
1. Clone this repo
1. Run `npm install`
1. Create a config.json file (see below), or modify the index.js file for your purposes
1. Create your buckets
1. Run Gulp (see below)
1. Create and upload your Lambda function
1. Invoke the lambda function by uploading a video to your source bucket or run it manually in the AWS console.

## Gulp
See Adam Neary's ([@adamrneary](https://github.com/adamrneary)) [A Gulp Workflow for Amazon Lambda](https://medium.com/@AdamRNeary/a-gulp-workflow-for-amazon-lambda-61c2afd723b6)

There are a few more Gulp tasks to download, extract, and copy the 64-bit linux build of FFmpeg from John Van Sickle's [FFmpeg builds site](http://johnvansickle.com/ffmpeg/).

The default gulp task will run all of the tasks (except for upload... for now). This will result in the following actions:
* Cleans the build directory, dist directory, and dist.zip
* Downloads, extracts, and copies FFmpeg and FFprobe to the dist directory
* Copies the index.js and config.json file to the dist directory
* Runs npm install in the dist directory (excludes dev dependencies)
* Zips everything into dist.zip. This file is what you will upload to AWS Lambda for execution.

# AWS Configuration
Just need to set up the S3 buckets and Upload the Lambda function (dist.zip).

## Lambda Function
Downloads the file that gets uploaded to the source bucket, streams it through FFmpeg, outputs a scaled mp4 file and a png image, and then uploads both files to the destination bucket.  

### IAM Execution Role Policy
```JSON
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:*"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::source-bucket/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject"
            ],
            "Resource": [
                "arn:aws:s3:::destination-bucket/*"
            ]
        }
    ]
}
```

### config.json
```JSON
{
	"videoMaxWidth": 320,
	"videoMaxDuration": 15,
	"destinationBucket": "destination-bucket",
	"linkPrefix": "http://my.site/",
    "gzip": true
}
```

## S3 Buckets
You'll need to create 2 buckets, a source bucket and a destination bucket. You could probably get away with one bucket and a fancy prefix policy, but that's probably more of a hassle than it's worth.

The source bucket should be configured to trigger Lambda events: 
![Source Bucket Event Configuration](doc/source-bucket-config.png?raw=true "Source Bucket Event Configuration")

# Testing
Sample file if you want to run a test locally. Modify the bucket name and object key.

```JavaScript
var lambda = require('./index').handler;

lambda({
	Records: [{
		eventVersion: '2.0',
		eventSource: 'aws:s3',
		awsRegion: 'us-east-1',
		eventTime: '2015-04-09T00:00:00.000Z',
		eventName: 'ObjectCreated:Post',
		userIdentity: {principalId: 'XXXXXXXXXXXXXX'},
		requestParameters: {sourceIPAddress: '10.0.0.1'},
		responseElements: {
			'x-amz-request-id': 'AAAAAAAAAAAAAAAA',
			'x-amz-id-2': 'example+uvBeYL11YHRGvzOb5qQz7cwxh7AzPlE+zuM2zRN6vTvd/1Qe0TJpKPCvZBoO4dB0gqM='
		},
		s3: {
			s3SchemaVersion: '1.0',
			configurationId: 'ProcessUploads',
			bucket: {
				name: 'source-bucket',
				ownerIdentity: {principalId: 'XXXXXXXXXXXXXX'},
				arn: 'arn:aws:s3:::source-bucket'
			},
			object: {
				key: 'us-east-1%3A8ca8d677-aaaa-aaaa-aaaa-b75e887648ee/public/0524d7ce-aaaa-aaaa-aaaa-1f8cf05b3862.mp4',
				size: 1000000,
				eTag: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
			}
		}
	}]
}, {
	fail: function (error) {
		console.log('Failed:', error);
		process.exit(1);
	},
	succeed: function(result) {
		console.log('Succeeded:', result);
		process.exit();
	}
});
```

# Gotchas
- The object key from the event is URL encoded. Spaces in the filenames might be replaced with `+` so be aware of this and handle errors appropriately. If you try to download the file with the AWS SDK for JavaScript like in this example, without handling this, it will throw an error.
- Not handling errors with `context.fail(error)` will cause the function to run until the timeout is reached.
- Pick the largest memory allocation. This is mostly CPU bound, but Lambda bundles memory and CPU allocation together. Testing with different videos and sizes should give you a good idea if it meets the requirements. Total execution time is limited!
