> An ~~[AWS Lambda](http://aws.amazon.com/lambda/)~~ Event-driven function that resizes videos and outputs thumbnails using [FFmpeg](https://www.ffmpeg.org/). This function is meant for short-duration videos. If you need to transcode long videos, check out [AWS Elastic Transcoder](http://aws.amazon.com/elastictranscoder/).

[![Dependency Status](https://david-dm.org/binoculars/aws-lambda-ffmpeg.svg)](https://david-dm.org/binoculars/aws-lambda-ffmpeg)
[![devDependency Status](https://david-dm.org/binoculars/aws-lambda-ffmpeg/dev-status.svg)](https://david-dm.org/binoculars/aws-lambda-ffmpeg#info=devDependencies)
[![Known Vulnerabilities](https://snyk.io/test/github/binoculars/aws-lambda-ffmpeg/badge.svg)](https://snyk.io/test/github/binoculars/aws-lambda-ffmpeg)
[![Greenkeeper badge](https://badges.greenkeeper.io/binoculars/aws-lambda-ffmpeg.svg)](https://greenkeeper.io/)

- Master: [![Build Status](https://travis-ci.org/binoculars/aws-lambda-ffmpeg.svg?branch=master)](https://travis-ci.org/binoculars/aws-lambda-ffmpeg)
- Develop: [![Build Status](https://travis-ci.org/binoculars/aws-lambda-ffmpeg.svg?branch=develop)](https://travis-ci.org/binoculars/aws-lambda-ffmpeg)

The different platforms have different naming conventions for their services. To simplify this, listed below is a *proposed* table of generalized terms that are platform-independent.

| Term | Amazon Web Services | Microsoft Azure | Google Cloud Platform |
| --- | --- | --- | --- |
| Function | Lambda Function | Azure Function | Cloud Function |
| Storage Location | S3 Bucket | Storage Container | GCS Bucket |
| Storage Path | S3 Key | Blob Name | GCS File |

# Function Process Overview
1. A video file is uploaded to the source storage location
1. A notification event triggers the function
1. The function downloads the video file from the source location
1. Streams the video through FFmpeg
1. Outputs a scaled video file and a thumbnail image
1. Uploads both files to the destination bucket

# Supported Platforms
- [x] Amazon Web Services (aws) Lambda
- [x] Google Cloud Platform (gcp) Cloud Functions (Alpha)
- [ ] IBM (ibm) OpenWhisk (Not started)
- [ ] Microsoft Azure (msa) Functions (Still some work to do here)

# Setup
1. Install node.js, preferably through [nvm](/creationix/nvm). Each platform service uses a specific version of Node.js.
1. Clone this repo `git clone ...`
1. Run `npm install`
1. Create your function code's storage location (or choose an existing one)
1. Update the platform-specific configuration JSON file (see below), and/or modify the code file for your purposes
1. Run Gulp (see below)
1. Invoke the function by uploading a video to your source storage location.

## Configuration
See [config_samples](config_samples/).

At minimum, you need to modify:
- `functionBucket` - The name of the bucket where your the lambda function code will be uploaded to. It's necessary for CloudFormation.
- `sourceBucket` - The name of the bucket that will receive the videos and send them to the lambda for processing.
- `destinationBucket` - The name of the bucket that will be used to store the output video and thumbnail image.

## Local Testing

### Unit Tests
- Run `npm test`

### Integration Tests
- [Install FFmpeg locally](https://ffmpeg.org/download.html) or use the [compilation guide](https://trac.ffmpeg.org/wiki/CompilationGuide)
- Edit `event/{platform}.json` and run `node test/{platform}.js`, where platform is (aws|msa|gcp)
- When switching among the platforms, reinstall the node modules if the runtime supports a different version of Node.js.
- See the platform-specific notes

## Gotchas
- Gzipping videos will cause Safari errors in playback. Don't enable gzip unless you don't care about supporting Safari.

# Platform-specific notes
## AWS Lambda
- [Version information](https://docs.aws.amazon.com/lambda/latest/dg/current-supported-versions.html)
- Pick the largest memory allocation. This is mostly CPU bound, but Lambda bundles memory and CPU allocation together. Memory size is 1536 by default, in the CloudFormation template. Testing with different videos and sizes should give you a good idea if it meets your requirements. Total execution time is limited!
- The object key from the event is URL encoded. Spaces in the filenames might be replaced with `+` so be aware of this and handle errors appropriately. If you try to download the file with the AWS SDK for JavaScript like in this example, without handling this, it will throw an error.
- Not handling errors with `context.fail(error)` will cause the function to run until the timeout is reached.

### Example local testing script
```bash
# Environment variables
export AWS_ACCESS_KEY_ID=AKIDEXAMPLE
export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY
export AWS_REGION=us-east-1
export DESTINATION_BUCKET=destination-bucket
# Note that the following variable is single-quote escaped. Use $KEY_PREFIX to get the filename minus the extension.
export FFMPEG_ARGS=$'-c:a copy -vf scale=\'min(320\\,iw):-2\' -movflags +faststart -metadata description=http://my.site/$KEY_PREFIX.mp4 out.mp4 -vf thumbnail -vf scale=\'min(320\\,iw):-2\' -vframes 1 out.png'
export USE_GZIP=false
export MIME_TYPES='{"png":"image/png","mp4":"video/mp4"}'
export VIDEO_MAX_DURATION='30'
# Node version
nvm use 6.10 # This is subject to change
# Babel-node test script
node node_modules/babel-cli/bin/babel-node.js test/aws.js
```

### Gulp

#### Task: `aws:create-cfn-bucket`
Creates the CloudFormation for your CloudFormation template and Lambda function code. **Run this once**. Set the `CFN_S3_BUCKET` environment variable to the name of the bucket you want to create.
```bash
CFN_S3_BUCKET=cloudformation-bucket gulp aws:create-cfn-bucket
```

#### Environment Settings
The following environment variables must be set prior to using the rest of the gulp commands

```bash
export CFN_S3_BUCKET=cloudformation-bucket
export SOURCE_BUCKET=source-bucket
export DESTINATION_BUCKET=destination-bucket
# Note that the following variable is single-quote escaped. Use $KEY_PREFIX to get the filename minus the extension.
export FFMPEG_ARGS=$'-c:a copy -vf scale=\'min(320\\,iw):-2\' -movflags +faststart -metadata description=http://my.site/$KEY_PREFIX.mp4 out.mp4 -vf thumbnail -vf scale=\'min(320\\,iw):-2\' -vframes 1 out.png'
export USE_GZIP=false # can be true or false
export MIME_TYPES='{"png":"image/png","mp4":"video/mp4"}' # must be a JSON object with "extension": "mimeType" as the key/value pairs
export VIDEO_MAX_DURATION='30' # must be a number
```

#### Task: `aws:default`
Everything you need to get started. Note: You can change the stack name by setting environment variable `STACK_NAME`.
- Runs the `aws:build-upload` task
- Runs the `aws:deployStack` task

#### Task: `aws:build-upload`
- Builds `dist.zip`
  - Downloads and extracts FFmpeg binaries
  - Transpiles, installs dependencies, and copies configuration
- Uploads `dist.zip` to the function's S3 bucket

#### Task: `aws:deployStack`
- Creates or updates the CloudFormation stack which includes:
  - The lambda function's execution role and policy
  - The lambda function
  - The source bucket (where videos are uploaded to), including the notification configuration
  - The destination bucket (where videos and thumbnails go after they are processed)

#### Task: `aws:update`
Run after modifying anything in the function or configuration, if you've already created the stack. This will rebuild `dist.zip`, upload it to S3, and update the lambda function created during the CloudFormation stack creation.

## Google Cloud Functions
See the [quickstart guide](https://cloud.google.com/functions/quickstart).

### Gulp
Note: you must have the gcloud CLI tool installed.

#### Task: `gcp:default`
- Builds everything into the `build/` directory
- Deploys the function. Note: GCF does the `npm install` on the server-side, so there is no need to build a zip file.

### Example local testing script
```bash
# Environment variables
export GCLOUD_PROJECT=example-project-name
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
export CONFIG_FILE=../config/gcp.json
# Node version
nvm use 6.9.1 # This is subject to change
# Babel-node test script
node node_modules/babel-cli/bin/babel-node.js --presets es2015 test/gcp.js
```

## IBM OpenWhisk (not started, HELP WANTED)
See [the OpenWhisk repo](/openwhisk/openwhisk)

## Microsoft Azure Functions (in progress, HELP WANTED)
See [Azure functions reference](https://azure.microsoft.com/en-us/documentation/articles/functions-reference-node/).

### Example local testing script
```bash
# Environment variables
export AZURE_STORAGE_CONNECTION_STRING=... # copy from azure console
export CONFIG_FILE=../config/msa.json
# Node version
nvm use 5.9.1 # This is subject to change
# Babel-node test script
node node_modules/babel-cli/bin/babel-node.js --presets es2015-node5 test/aws.js
```

# Contributing
Submit issues if you find bugs or something is unclear. Pull requests are even better, especially if you can make something more generalized.

**If you use it, :star: it!**
