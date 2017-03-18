'use strict';

const chalk = require('chalk');

const columns = [
	24,
	18,
	26,
	37
];

const columnChars = columns.map(n => '─'.repeat(n + 2));

const table = {
	borderTop:`┌${columnChars.join('┬')}┐`,
	borderBottom: `└${columnChars.join('┴')}┘`,
	divider: `├${columnChars.join('┼')}┤`
};

/**
 * Adds padding to the end of a string
 *
 * @param str {string}
 * @param n {number} - Total Length
 * @returns {string}
 */
function pad(str, n) {
	return `${str}${' '.repeat(Math.max(n - str.length, 0))}`;
}

/**
 * Gets the chalk color for the CloudFormation Resource Status
 *
 * @param status {string}
 * @returns {string}
 */
function getResourceStatusColor(status) {
	if (/(FAILED|ROLLBACK)/.test(status))
		return 'red';
	else if (/IN_PROGRESS$/.test(status))
		return 'yellow';
	else if (/COMPLETE$/.test(status))
		return 'green';

	return 'reset';
}

/**
 * Converts an array of cells to a row
 *
 * @param cells {![string]}
 * @returns {string}
 */
function cellsToRow(cells) {
	return `│ ${cells.join(' │ ')} │`;
}

/**
 * Converts a stack event to a table row
 *
 * @param stackEvent {!object}
 * @param stackEvent.Timestamp {!date}
 * @param stackEvent.ResourceStatus {string}
 * @param stackEvent.ResourceType {string}
 * @param stackEvent.LogicalResourceId {string}
 * @returns {string}
 */
function stackEventToRow(stackEvent) {
	const cells = [
		stackEvent.Timestamp.toISOString(),
		stackEvent.ResourceStatus,
		stackEvent.ResourceType,
		stackEvent.LogicalResourceId
	].map((val, i) => val.match(new RegExp(`.{1,${columns[i]}}`, 'g')));

	const style = chalk.styles[
		getResourceStatusColor(stackEvent.ResourceStatus)
	];

	const maxLines = cells
		.reduce((acc, val) => val.length > acc ? val.length : acc, '');

	const lines = [];

	for (let i = 0; i < maxLines; i++) {
		const line = [];

		for (let j = 0; j < cells.length; j++) {
			const isColored = j === 1;
			const open = isColored ? style.open : '';
			const close = isColored ? style.close : '';
			const value = pad(cells[j][i] || '', columns[j]);

			line.push(`${open}${value}${close}`);
		}

		lines.push(cellsToRow(line));
	}

	return lines.join('\n');
}

const headCells = [
	'Timestamp',
	'Status',
	'Type',
	'Logical Id'
].map((val, i) => pad(val, columns[i]));

const head = [
	table.borderTop,
	cellsToRow(headCells),
	table.divider
].join('\n');

module.exports = {
	columns,
	stackEventToRow,
	table,
	head
};
