import {node, extend, getOxlintConfig} from '@bhsd/code-standard';

const config = getOxlintConfig(extend(
	...node,
));

export default config;
