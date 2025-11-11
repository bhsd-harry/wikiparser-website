import fs from 'fs';
import path from 'path';
import Parser from 'wikiparser-node';
import type {Token} from 'wikiparser-node';

Parser.config = 'mediawikiwiki';
Parser.templateDir = path.resolve('wiki');
Parser.getConfig();
Object.assign(Parser.config, {articlePath: '/wikiparser-website/$1'});

// @ts-expect-error private method
Parser.info(`Using wiki directory: ${Parser.templateDir}`);
for (const file of fs.readdirSync(Parser.templateDir)) {
	if (!file.endsWith('.wiki') || /^(?:Template|MediaWiki):/u.test(file)) {
		continue;
	}
	const page = file.slice(0, -5),
		title = page.replaceAll('_', ' '),
		/* eslint-disable @stylistic/max-len */
		wiki = `<div style="font-size:small;margin-bottom:.5em">This article incorporates material derived from the [https://www.mediawiki.org/wiki/${
			page
		} ${title}] article at [https://www.mediawiki.org/ MediaWiki.org] ${
			title.startsWith('Help:')
				? 'as Public Domain ([https://creativecommons.org/publicdomain/zero/1.0/ CC0])'
				: 'under the [https://creativecommons.org/licenses/by-sa/4.0/ Creative Commons Attribution/Share-Alike License (CC BY-SA)]'
		}.</div>
${fs.readFileSync(path.join('wiki', file), 'utf8')}`,
		root = Parser.parse(wiki);
	root.pageName = page;
	root.addEventListener('expand', (_, {token}: {token: Token}) => {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		fs.writeFileSync(path.join('expanded', file), String(token));
	});
	const content = ((): string => {
			try {
				return root.toHtml();
			} catch (e) {
				if (e instanceof Error) {
					const {message} = e;
					e.message = `${page}: ${message}`;
					console.error(e);
					return `<strong class="error">Error rendering page: ${message}</strong>`;
				}
				throw e;
			}
		})(),
		html = `<!DOCTYPE html>
<html dir="ltr" lang="en-US">
<head>
	<title>${title}</title>
	<meta charset="utf-8">
	<meta name="viewport" content="initial-scale=1.0, user-scalable=yes, minimum-scale=0.25, maximum-scale=5.0, width=device-width">
	<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">
	<link rel="stylesheet" href="./css/page.css">
	<link rel="stylesheet" href="./css/templatestyles.css">
</head>
<body>
	<main>
		<article>${content}</article>
	</main>
</body>
</html>`;
	/* eslint-enable @stylistic/max-len */
	fs.writeFileSync(`${page}.html`, html);
}
