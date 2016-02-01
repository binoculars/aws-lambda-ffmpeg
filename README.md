> An [AWS Lambda](http://aws.amazon.com/lambda/) function that resizes videos and outputs thumbnails using [FFmpeg](https://www.ffmpeg.org/). This function is meant for short-duration videos. If you need to transcode long videos, check out [AWS Elastic Transcoder](http://aws.amazon.com/elastictranscoder/).

## Setup
1. Install node.js, preferably through [nvm](/creationix/nvm). Lambda uses a [specific version of node](http://docs.aws.amazon.com/lambda/latest/dg/current-supported-versions.html), so it would be best use the same version--especially when installing dependencies via npm.
1. Clone this repo
1. Run `npm install`
1. Create a config.json file (see below), or modify the index.js file for your purposes
1. Create your function code's S3 bucket (this will hold your zipped lambda function) (optional if you already have a bucket for this)
1. Run Gulp (see below)
1. Create and upload your Lambda function
1. Invoke the lambda function by uploading a video to your source bucket or run it manually in the AWS console.

## Gulp
See Adam Neary's ([@adamrneary](https://github.com/adamrneary)) [A Gulp Workflow for Amazon Lambda](https://medium.com/@AdamRNeary/a-gulp-workflow-for-amazon-lambda-61c2afd723b6)

There are a few more Gulp tasks to download, extract, and copy the 64-bit linux build of FFmpeg from John Van Sickle's [FFmpeg builds site](http://johnvansickle.com/ffmpeg/).

The default gulp task will run all of the tasks. This will result in the following actions:
- Cleans the build directory, dist directory, and dist.zip
- Downloads, extracts, and copies FFmpeg and FFprobe to the dist directory
- Copies the index.js and config.json file to the dist directory
- Runs npm install in the dist directory (excludes dev dependencies)
- Zips everything into dist.zip. This file is what you will upload to AWS Lambda for execution.
- Uploads the function to AWS (must create config.json first and have your AWS credentials set as environment variables).
- Creates or updates the CloudFormation stack which includes:
 - The lambda function's execution role and policy
 - The lambda function
 - The source bucket (where videos are uploaded to), including the notification configuration
 - The destination bucket (where videos and thumbnails go after they are processed)

## Lambda Function Process Overview
1. User uploads a video file to the source bucket
1. A notification event trigger the lambda function
1. The lambda function downloads the video file from the source bucket
1. Streams it through FFmpeg
1. Outputs a scaled video file and a thumbnail image
1. Uploads both files to the destination bucket

## Configuration
See [config_sample.json](config_sample.json). config.json will be copied after npm install.

At minimum, you need to modify:
- `functionBucket` - The name of the bucket where your the lambda function code will be uploaded to. It's necessary for CloudFormation.
- `sourceBucket` - The name of the bucket that will receive the videos and send them to the lambda for processing.
- `destinationBucket` - The name of the bucket that will be used to store the output video and thumnail image.

## Testing
Edit test_event.json, by modifying the bucket name and object key, and run `npm test` if you want to run a test locally.

## Gotchas
- Gzipping videos will cause Safari errors in playback. Don't enable gzip unless you don't care about supporting Safari.
- The object key from the event is URL encoded. Spaces in the filenames might be replaced with `+` so be aware of this and handle errors appropriately. If you try to download the file with the AWS SDK for JavaScript like in this example, without handling this, it will throw an error.
- Not handling errors with `context.fail(error)` will cause the function to run until the timeout is reached.
- Pick the largest memory allocation. This is mostly CPU bound, but Lambda bundles memory and CPU allocation together. Memory size is 1536 by default. Testing with different videos and sizes should give you a good idea if it meets the requirements. Total execution time is limited!

## Contributing
Submit issues if you find bugs or something is unclear. Pull requests are event better, especially if you can make something more generalized.

**If you use it, star it!**