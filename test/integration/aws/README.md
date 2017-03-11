# The bootstrap CloudFormation template

## Bucket
The S3 bucket to store build artifacts (The CloudFormation template and Lambda Function).

## CloudFormation Service Role
See the [AWS Documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html) for details.

## Module Policy
An [IAM ManagedPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-managedpolicy.html) for the Execution Role Policy for the Lambda Function

* Logs - Standard Lambda logs configuration
  * CreateLogGroup
  * CreateLogStream
  * PutLogEvents
* S3
  * GetObject - get the input file
  * PutObject - put the output file

## CloudFormation Service Role Policy
The [IAM Policy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-iam-policy.html) for the CloudFormation Service Role 

* S3
  * CreateBucket - Create the source and destination buckets for each branch/tag
  * DeleteBucket - Delete the source and destination buckets for each branch/tag
* S3
  * GetObject - Get the Lambda Function zip file from the Bucket
* IAM
  * AttachRolePolicy - 
* Lambda
  * AddPermission
  * CreateFunction - Create the function
  * DeleteFunction - Delete the function
  * RemovePermission
  * UpdateFunctionCode
  * UpdateFunctionConfiguration

## CI User
The user responsible for all CI functions

## CI Policy
* IAM - Get and Pass the Service Role for CloudFormation
  * GetRole
  * PassRole
* S3
  * PutObject - Upload the CloudFormation Template and Lambda Function
  * GetObject - Get the CloudFormation Template and Lambda Function
  * DeleteObject - Delete the CloudFormation Template and Lambda Function
* CloudFormation
  * CreateStack - Create the CloudFormation stack for each branch/tag
  * UpdateStack - Update previously created stacks
* CloudFormation
  * DeleteStack - Delete stacks made from tags 
* CloudFormation
  * DescribeStackEvents - List stack events
  * DescribeStackResource - Get stack resource details
  * DescribeStacks - Get the status of the stack
* CloudFormation
  * ValidateTemplate - Validate stack templates
* S3
  * PutObject - Upload the test video
  * DeleteObject - Delete the test video
* S3
  * GetObject - Get the result test video and image
  * DeleteObject - Delete the result test video and image
* Lambda
  * UpdateFunctionCode
* CloudWatchLogs
  * FilterLogEvents - Get Lambda events during CI test


# Testing the Function
1. Upload the CloudFormation and S3 Template to the CI bucket
1. Create/Update the Stack
  * LambdaS3Bucket = the CI Bucket
  * LambdaS3Key = /(branch|tag)-(branchName|tagName)/lambda.zip
1. Upload the video to the source bucket (S3 PutObject)
1. Wait for the Lambda function to finish (or error)
1. Delete the processed files in the destination bucket
1. Delete the video in the source bucket
1. If tag, Delete the CloudFormation stack

