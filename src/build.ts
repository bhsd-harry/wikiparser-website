import fs from 'fs';
import path from 'path';
import assert from 'assert';
import {JSDOM} from 'jsdom';
import createDOMPurify from 'dompurify';
import {profile} from '@bhsd/nodejs';
import getParser from './parser';
import type {Token} from 'wikiparser-node';

const {argv} = process;
let [,,,, ...args] = argv;
const hasArg = args.length > 0,
	[,, dir = 'MediaWiki', cfg = 'mediawikiwiki'] = argv,
	expandedDir = path.join('expanded', dir),
	Parser = getParser(dir, cfg);
args = hasArg ? args.map(file => path.basename(file)) : fs.readdirSync(Parser.templateDir!);

// 使用DOMPurify检查渲染结果的安全性，防止XSS攻击
const {window} = new JSDOM(''),
	DOMPurify = createDOMPurify(window);

/**
 * 检查HTML字符串是否安全
 * @param render HTML字符串
 * @param page 页面名称（用于错误信息）
 */
const purify = (render: string, page: string): void => {
	DOMPurify.sanitize(new JSDOM(render).window.document.body.innerHTML, {
		ALLOWED_URI_REGEXP:
			/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|bitcoin):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/iu,
	});
	assert.deepStrictEqual(
		DOMPurify.removed.map(item => {
			if ('element' in item) {
				const ele = item.element as Element;
				return ele.outerHTML;
			}
			const {attribute, from} = item;
			if (!attribute) {
				return item;
			}
			const {name, value} = attribute;
			return !(
				name === 'typeof' && /^mw:File(?:\/\w+)?$/u.test(value)
				|| name === 'id' && /^H[1-6]$/u.test((from as Element).tagName)
			) && {[name]: value};
		}).filter(Boolean),
		[],
		`Unsafe HTML detected in ${page}`,
	);
};

if (!fs.existsSync(dir)) {
	fs.mkdirSync(dir);
}
if (!fs.existsSync(expandedDir)) {
	fs.mkdirSync(expandedDir);
}

/**
 * Render a page to an HTML file.
 * @param page file name without extension
 * @param title normalized page title
 * @param root root token
 */
const render = (page: string, title: string, root: Token): void => {
	const label = `${page} rendered in`;
	console.time(label);
	const content = ((): string => {
			try {
				return root.toHtml();
			} catch (e) {
				if (Error.isError(e)) {
					const {message} = e;
					e.message = `${page}: ${message}`;
					console.error(e);
					return `<strong class="error">Error rendering page: ${message}</strong>`;
				}
				throw e;
			}
		})(),
		/* eslint-disable @stylistic/max-len */
		html = `<!DOCTYPE html>
<html dir="ltr" lang="en-US">
<head>
	<title>${title}</title>
	<meta charset="utf-8">
	<meta name="viewport" content="initial-scale=1.0, user-scalable=yes, minimum-scale=0.25, maximum-scale=5.0, width=device-width">
	<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">
	<link rel="stylesheet" href="/wikiparser-website/css/page.css">${
		/["\s]mw-highlight mw-highlight-lang-/u.test(content)
			? `
	<link rel="stylesheet" href="https://fastly.jsdelivr.net/npm/prismjs/themes/prism.min.css">`
			: ''
	}
</head>
<body>
	<main>
		<article>${content}</article>
	</main>
</body>
</html>`;
	/* eslint-enable @stylistic/max-len */
	purify(html, page);
	fs.writeFileSync(`${page}.html`, html);
	console.timeEnd(label);
};

(async () => {
	await profile(() => {
		// Render regular pages
		for (let file of args) {
			if (file.endsWith('.html')) {
				file = `${file.slice(0, -5)}.wiki`;
			}
			if (!file.endsWith('.wiki') || /^(?:Template|MediaWiki):/u.test(file)) {
				continue;
			}
			const page = file.slice(0, 1).toUpperCase() + file.slice(1, -5),
				title = page.replaceAll('_', ' ');
			let front = '';
			switch (dir) {
				/* eslint-disable @stylistic/max-len */
				case 'MediaWiki':
					front = `<div style="font-size:small;margin-bottom:.5em">This article incorporates material derived from the [https://www.mediawiki.org/wiki/${
						page
					} ${title}] article at [https://www.mediawiki.org/ MediaWiki.org] ${
						title.startsWith('Help:')
							? 'as Public Domain ([https://creativecommons.org/publicdomain/zero/1.0/ CC0])'
							: 'under the [https://creativecommons.org/licenses/by-sa/4.0/ Creative Commons Attribution/Share-Alike License (CC BY-SA)]'
					}.</div>
`;
					break;
				case 'bips': {
					const article = page.slice(0, -10).replace('-', '_')
						.toUpperCase();
					front = article === 'README'
						? ''
						: `<div style="font-size:small;margin-bottom:.5em">This article incorporates material derived from the [https://en.bitcoin.it/wiki/${
							article
						} ${
							article.replace('_', ' ')
						}] article at [https://en.bitcoin.it/ Bitcoin Wiki] under the [https://creativecommons.org/licenses/by/3.0/ Creative Commons Attribution 3.0 (CC BY 3.0)].</div>
`;
					break;
				}
				/* eslint-enable @stylistic/max-len */
				// no default
			}
			const wiki = front + fs.readFileSync(path.join('wiki', dir, file), 'utf8'),
				root = Parser.parse(wiki);
			root.pageName = page;
			root.addEventListener('expand', (_, {token}: {token: Token}) => {
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				fs.writeFileSync(path.join(expandedDir, file), String(token));
			});
			render(path.join(dir, page), title, root);
		}

		// Render Special:AllPages
		const allPages = fs.globSync(`${dir}/**/*.html`)
			.filter(file => file !== `${dir}/index.html`)
			.map(file => file.slice(dir.length + 1, -5).replaceAll('_', ' '));
		allPages.sort((a, b) => a.localeCompare(b));
		const wiki = `==${dir}==
<div class="mw-allpages-body">
${allPages.map(s => `*[[:${s}]]`).join('\n')}
</div>
`;
		render(dir === 'MediaWiki' ? 'index' : `${dir}/index`, 'Special:All pages', Parser.parse(wiki));
	}, 'log');
})();
