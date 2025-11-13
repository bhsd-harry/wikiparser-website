'use strict';

const config = require('@bhsd/code-standard/stylelintrc.cjs');

module.exports = {
	...config,
	rules: {
		...config.rules,
		'no-descending-specificity': null,
		'number-max-precision': null,
	},
};
