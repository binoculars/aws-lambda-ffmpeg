var util = require('util');
var azureFunction = require('../../platform/msa/index.js').ffmpeg;
var event = require('./event.json');

var context = {
	bindings: {},
	log: console.log,
	done: function(error, propertyBag) {
		if (error) {
			console.error(error);
			process.exit(1);
		} else {
			console.log(propertyBag);
			process.exit();
		}
	}
};

azureFunction(context, event);