var util = require('util');
var lambda = require('../../platform/aws/index.js').handler;
var event = require('./event.json');

/**
 * The Context
 * 
 * @type {{succeed: context.succeed, fail: context.fail, done: context.done, getRemainingTimeInMillis: context.getRemainingTimeInMillis, functionName: string, functionVersion: string, invokedFunctionArn: string, memoryLimitInMB: number, awsRequestId: string, logGroupName: string, logStreamName: string, identity: {}}}
 */
var context = {
	/**
	 * Indicates the Lambda function execution and all callbacks completed successfully.
	 *
	 * @type {function}
	 * @param {Object} [result] - An optional parameter and it can be used to provide the result of the function
	 * execution. The result provided must be JSON.stringify compatible. If AWS Lambda fails to stringify or encounters
	 * another error, an unhandled exception is thrown, with the X-Amz-Function-Error response header set to Unhandled.
	 */
	succeed: function(result) {
		console.log('Succeeded:', util.inspect(result, {depth: 5}));
		process.exit();
	},

	/**
	 * Indicates the Lambda function execution and all callbacks completed unsuccessfully, resulting in a handled exception.
	 *
	 * @type {function}
	 * @param {Object|null} [error] - an optional parameter that you can use to provide the result of the Lambda
	 * function execution. If the error value is non-null, the method will set the response body to the string
	 * representation of error and also write corresponding logs to CloudWatch. If AWS Lambda fails to stringify or
	 * encounters another error, an unhandled error, with the X-Amz-Function-Error header set to Unhandled.
	 */
	fail: function(error) {
		console.error('Failed:', error);
		process.exit(1);
	},

	/**
	 * This method complements the succeed() and fail() methods by allowing the use of the "error first" callback
	 * design pattern. It provides no additional functionality.
	 *
	 * @type {function}
	 * @param {Object|null} [error]
	 * @param {Object} [result]
	 */
	done: function(error, result) {
		if (error)
			context.fail(error);
		else
			context.succeed(result);
	},

	/**
	 * You can use this method to check the remaining time during your function execution and take appropriate
	 * corrective action at run time.
	 *
	 * @type {function}
	 * @returns {number} - The approximate remaining execution time (before timeout occurs) of the Lambda function
	 * that is currently executing. The timeout is one of the Lambda function configuration. When the timeout reaches,
	 * AWS Lambda terminates your Lambda function.
	 */
	getRemainingTimeInMillis: function() {
		return Infinity;
	},

	/**
	 * Name of the Lambda function that is executing.
	 *
	 * @type {string}
	 */
	functionName: '',

	/**
	 * The Lambda function version that is executing. If an alias is used to invoke the function, then
	 * `function_version` will be the version the alias points to.
	 *
	 * @type {string}
	 */
	functionVersion: '',

	/**
	 * The ARN used to invoke this function. It can be function ARN or alias ARN. An unqualified ARN executes the
	 * `$LATEST` version and aliases execute the function version it is pointing to.
	 *
	 * @type {string}
	 */
	invokedFunctionArn: '',

	/**
	 * Memory limit, in MB, you configured for the Lambda function. You set the memory limit at the time you create a
	 * Lambda function and you can change it later.
	 *
	 * @type {number}
	 */
	memoryLimitInMB: 0,

	/**
	 * AWS request ID associated with the request. This is the ID returned to the client that called the `invoke`
	 * method.
	 *
	 * Note
	 *  If AWS Lambda retries the invocation (for example, in a situation where the Lambda function that is processing
	 *  Amazon Kinesis records throws an exception), the request ID remains the same.
	 *
	 * @type {string}
	 */
	awsRequestId: '',

	/**
	 * The name of the CloudWatch log group where you can find logs written by your Lambda function.
	 *
	 * @type {string}
	 */
	logGroupName: '',

	/**
	 * The name of the CloudWatch log group where you can find logs written by your Lambda function. The log stream may
	 * or may not change for each invocation of the Lambda function.
	 *
	 * The value is null if your Lambda function is unable to create a log stream, which can happen if the execution
	 * role that grants necessary permissions to the Lambda function does not include permissions for the CloudWatch
	 * actions.
	 * 
	 * @type {string}
	 */
	logStreamName: '',

	/**
	 * Information about the Amazon Cognito identity provider when invoked through the AWS Mobile SDK. It can be null.
	 * 
	 * @type {Object}
	 */
	identity: {

	}
};

lambda(event, context);