import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import Parser from 'wikiparser-node';
import type {Title, Token, LinkToken as LinkTokenBase} from 'wikiparser-node';

declare abstract class PrivateToken extends LinkTokenBase { // eslint-disable-line @typescript-eslint/no-unused-vars
	toHtmlInternal(): string;
}

/**
 * Get the file path for a given page.
 * @param title page title
 */
const getFile = (title: string | Title): string => {
	const isTitle = typeof title !== 'string';
	return path.join('wiki', (isTitle ? title.title : title) + (isTitle ? '.wiki' : ''));
};

// Configure the parser for MediaWiki.org
Parser.config = 'mediawikiwiki';

// Set custom article path
Parser.getConfig();
const articlePath = 'https://bhsd-harry.github.io/wikiparser-website/';
Object.assign(Parser.config, {articlePath});

// Set wiki template directory
Parser.templateDir = path.resolve('wiki');
// @ts-expect-error private method
Parser.info(`Using wiki directory: ${Parser.templateDir}`);

// Hook to render TemplateStyles
const templatestyles = new WeakMap<Token, Set<string>>();
Parser.setHook('templatestyles', token => {
	const src = token.getAttr('src');
	if (!src || src === true) {
		return '<strong class="error">TemplateStyles\' <code>src</code> attribute must not be empty.</strong>';
	}
	const page = Parser.normalizeTitle(src, 10),
		{valid, title} = page;
	if (!valid) {
		return '<strong class="error">Invalid title for TemplateStyles\' <code>src</code> attribute.</strong>';
	}
	const contentmodel = Parser.callParserFunction('contentmodel', 'canonical', title);
	if (contentmodel !== 'sanitized-css') {
		return `<strong class="error">Page [[:${
			title
		}]] must have content model "sanitized-css" for TemplateStyles (current model is "${contentmodel}").</strong>`;
	}
	const root = token.getRootNode();
	if (!templatestyles.has(root)) {
		templatestyles.set(root, new Set());
	}
	const styles = templatestyles.get(root)!;
	if (styles.has(src)) {
		return '';
	}
	styles.add(src);
	try {
		return `<style>${
			esbuild.transformSync(
				fs.readFileSync(getFile(title), 'utf8'),
				{loader: 'css', minify: true, legalComments: 'none'},
			).code.trim()
		}</style>`;
	} catch {
		return `<strong class="error">Page [[:${title}]] has no content.</strong>`;
	}
});

// Hook to render `{{#ifexist:}}`
Parser.setFunctionHook('ifexist', token => {
	const page = token.getValue(1)!,
		no = token.getValue(3) ?? '',
		result = Parser.callParserFunction('ifexist', page, 'y');
	if (!result) {
		return no;
	}
	return fs.existsSync(getFile(Parser.normalizeTitle(page))) ? token.getValue(2) ?? '' : no;
});

// Hook to render `{{#invoke:}}`
Parser.setFunctionHook('invoke', token => {
	if (token.module === 'Module:String' && token.function === 'rep') {
		return (token.getValue(1) ?? '').repeat(Number(token.getValue(2) ?? 0));
	}
	return '';
});

// Render red links with "new" class
// @ts-expect-error private method
const {LinkToken}: {LinkToken: typeof PrivateToken} = Parser.require('./src/link');
const LinkBaseToken: typeof PrivateToken = Object.getPrototypeOf(LinkToken);
LinkToken.prototype.toHtmlInternal = function(): string {
	let html = LinkBaseToken.prototype.toHtmlInternal.call(this);
	const abs = ` href="${articlePath}`;
	if (html.includes(abs)) {
		html = html.replace(abs, ' href="/wikiparser-website/');
	}
	if (this.selfLink || fs.existsSync(getFile(this.link))) {
		return html;
	}
	return html.replace(
		/<a [^>]+/u,
		m => m.includes(' class="')
			? m.replace(' class="', ' class="new ')
			: `${m} class="new"`,
	);
};

// Render local images
// @ts-expect-error private method
const {FileToken}: {FileToken: typeof PrivateToken} = Parser.require('./src/link/file');
const {toHtmlInternal} = FileToken.prototype, // eslint-disable-line @typescript-eslint/unbound-method
	// @ts-expect-error RegExp.escape
	re = new RegExp(` (href|src)="${RegExp.escape(articlePath)}`, 'gu');
FileToken.prototype.toHtmlInternal = function(): string {
	return toHtmlInternal.call(this).replace(re, ' $1="/wikiparser-website/');
};

export default Parser;
