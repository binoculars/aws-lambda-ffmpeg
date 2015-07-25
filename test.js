var util = require('util');
var lambda = require('./index.js').handler;

lambda(require('./test_event.json'), {
	fail: function (error) {
		console.log('Failed:', error);
		process.exit(1);
	},
	succeed: function(result) {
		console.log('Succeeded:', util.inspect(result, {depth: 5}));
		process.exit();
	}
});