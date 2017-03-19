const lambda = require('../platform/aws/index.js').handler;
const event = require('../event/aws.json');

/**
 * The Context
 * 
 * @type {{getRemainingTimeInMillis: context.getRemainingTimeInMillis, callbackWaitsForEmptyEventLoop: boolean, functionName: string, functionVersion: string, invokedFunctionArn: string, memoryLimitInMB: number, awsRequestId: string, logGroupName: string, logStreamName: string, identity: {}}}
 */
const context = {
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
	 * The default value is true. This property is useful only to modify the default behavior of the callback. By
	 * default, the callback will wait until the Node.js runtime event loop is empty before freezing the process and
	 * returning the results to the caller. You can set this property to false to request AWS Lambda to freeze the
	 * process soon after the callback is called, even if there are events in the event loop. AWS Lambda will freeze
	 * the process, any state data and the events in the Node.js event loop (any remaining events in the event loop
	 * processed when the Lambda function is called next and if AWS Lambda chooses to use the frozen process). For more
	 * information about callback, see Using the Callback Parameter.
	 *
	 * @type {boolean}
	 */
	callbackWaitsForEmptyEventLoop: true,

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

const callback = function(error, data) {
	if (error)
		console.error(error);
	else if (data)
		console.log(data);

	process.exit(error ? 1 : 0);
};

lambda(event, context, callback);
