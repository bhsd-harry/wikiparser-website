import config from '@bhsd/code-standard/stylelint';

export default {
	...config,
	rules: {
		...config.rules,
		'no-descending-specificity': null,
		'number-max-precision': null,
		'selector-no-deprecated': [
			true,
			{
				ignoreSelectors: [
					'center',
					'tt',
				],
			},
		],
	},
};
