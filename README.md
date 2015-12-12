# Description
An [AWS Lambda](http://aws.amazon.com/lambda/) function that resizes videos and outputs thumbnails using [FFmpeg](https://www.ffmpeg.org/). This function is meant for short-duration videos. If you need to transcode long videos, check out [AWS Elastic Transcoder](http://aws.amazon.com/elastictranscoder/).

## Setup
1. Install node.js, preferably through [nvm](/creationix/nvm). Lambda uses a [specific version of node](http://docs.aws.amazon.com/lambda/latest/dg/current-supported-versions.html), so it would be best use the same version--especially when installing dependencies via npm.
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
* Uploads the function to AWS (must create config.json first and have your AWS credentials set as environment variables).

# AWS Configuration
Just need to set up the S3 buckets and Upload the Lambda function (dist.zip).

## Lambda Function
Downloads the file that gets uploaded to the source bucket, streams it through FFmpeg, outputs a scaled mp4 file and a png image, and then uploads both files to the destination bucket.  

### IAM Execution Role Policy
This will be created by the gulp upload task by default.

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
See [config_sample.json](config_sample.json). config.json will be copied after npm install.

```JSON
{
	"videoMaxWidth": 320,
	"videoMaxDuration": 15,
	"sourceBucket": "source-bucket",
	"destinationBucket": "destination-bucket",
	"linkPrefix": "http://my.site/",
    "gzip": false,
    "format": {
        "image": {
            "extension": "png",
            "mimeType": "image/png"
        },
        "video": {
            "extension": "mp4",
            "mimeType": "video/mp4"
        }
    }
}
```

## S3 Buckets
You'll need to create 2 buckets, a source bucket and a destination bucket. You could probably get away with one bucket and a fancy prefix policy, but that's probably more of a hassle than it's worth.

The source bucket should be configured to trigger Lambda events: 
![Source Bucket Event Configuration](doc/source-bucket-config.png?raw=true "Source Bucket Event Configuration")

Use the gulp `create-s3-buckets` task.

# Testing
Edit test_event.json, by modifying the bucket name and object key, and run `npm test` if you want to run a test locally.

# Gotchas
- Gzipping videos will cause Safari errors in playback. Don't enable gzip unless you don't care about supporting Safari.
- The object key from the event is URL encoded. Spaces in the filenames might be replaced with `+` so be aware of this and handle errors appropriately. If you try to download the file with the AWS SDK for JavaScript like in this example, without handling this, it will throw an error.
- Not handling errors with `context.fail(error)` will cause the function to run until the timeout is reached.
- Pick the largest memory allocation. This is mostly CPU bound, but Lambda bundles memory and CPU allocation together. Testing with different videos and sizes should give you a good idea if it meets the requirements. Total execution time is limited!
