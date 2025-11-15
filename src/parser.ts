import fs from 'fs';
import path from 'path';
import {execSync} from 'child_process';
import esbuild from 'esbuild';
import Parser from 'wikiparser-node';
import type {Title, Token, LinkToken as LinkTokenBase, TranscludeToken} from 'wikiparser-node';

declare global {
	interface RegExpConstructor {
		escape(str: string): string;
	}
}
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
const articlePath = '//bhsd-harry.github.io/wikiparser-website/';
Object.assign(Parser.config, {articlePath});

// Set wiki template directory
Parser.templateDir = path.resolve('wiki');
// @ts-expect-error private method
Parser.info(`Using wiki directory: ${Parser.templateDir}`);

// Hook to render <templatestyles>
const templatestyles = new WeakMap<Token, Set<string>>();
Parser.setHook('templatestyles', token => {
	const src = token.getAttr('src');
	if (!src || src === true) {
		return '<strong class="error">TemplateStyles\' <code>src</code> attribute must not be empty.</strong>';
	}
	const page = Parser.normalizeTitle(src, 10),
		{valid, title, ns} = page;
	if (!valid) {
		return '<strong class="error">Invalid title for TemplateStyles\' <code>src</code> attribute.</strong>';
	}
	const contentmodel = Parser.callParserFunction(
		'contentmodel',
		'canonical',
		(ns === 10 ? '' : 'Template:') + title,
	);
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
		no = token.getValue(3) ?? '';
	try {
		const result = Parser.callParserFunction('ifexist', page, 'y');
		if (!result) {
			return no;
		}
	} catch {
		// @ts-expect-error private method
		Parser.error(`Error checking existence of page: ${page}`);
		return no;
	}
	return fs.existsSync(getFile(Parser.normalizeTitle(page))) ? token.getValue(2) ?? '' : no;
});

// Hook to render `{{formatnum:}}`
Parser.setFunctionHook('formatnum', token => {
	const value = token.getValue(1)!,
		num = Number(value);
	return !value || Number.isNaN(num) ? value : num.toLocaleString();
});

/**
 * Convert string to Lua string.
 * @param s string to convert
 * @param num whether to treat as a number
 */
const toLuaString = (s: string, num?: boolean): string =>
	num && Number.isInteger(Number(s)) ? s : JSON.stringify(s).replaceAll(String.raw`\u0000`, String.raw`\u{0000}`);

/**
 * Convert frame to Lua table string.
 * @param frame Scribunto frame
 */
const frameToLuaTable = (frame: ReturnType<TranscludeToken['getFrame']>, indent = ''): string => {
	let table = `
	${indent}title = ${JSON.stringify(frame.title)},
	${indent}args = {`;
	for (const [k, v] of Object.entries(frame.args)) {
		table += `
		${indent}[${toLuaString(k, true)}] = ${toLuaString(v)},`;
	}
	table += `
	${indent}}`;
	if (frame.parent) {
		table += `,
	_parent = {${frameToLuaTable(frame.parent, '\t')}
	}`;
	}
	return table;
};

// Hook to render `{{#invoke:}}`
Parser.setFunctionHook('invoke', (token, context) => {
	const {module: m, function: f} = token;
	if (fs.existsSync(`${m}.lua`)) {
		fs.writeFileSync(
			'frame.lua',
			`return {${frameToLuaTable(token.getFrame(context))}
}`,
		);
		return execSync(`lua Scribunto.lua "${m}" "${f}"`, {encoding: 'utf8'})
			.replace(/\n$/u, '');
	}
	return `<strong class="error">Script error: No such module "${m}`;
});

// Render red links with "new" class
// @ts-expect-error private method
const {LinkBaseToken}: {LinkBaseToken: typeof PrivateToken} = Parser.require('./src/link/base');
const linkTypes = new Set(['link', 'category', 'redirect-target']),
	f1 = LinkBaseToken.prototype.toHtmlInternal; // eslint-disable-line @typescript-eslint/unbound-method
LinkBaseToken.prototype.toHtmlInternal = function(): string {
	if (linkTypes.has(this.type)) {
		let html = f1.call(this);
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
	}
	return '';
};

// Render local images
// @ts-expect-error private method
const {FileToken}: {FileToken: typeof PrivateToken} = Parser.require('./src/link/file');
const re = new RegExp(` (href|src)="${RegExp.escape(articlePath)}`, 'gu'),
	f2 = FileToken.prototype.toHtmlInternal; // eslint-disable-line @typescript-eslint/unbound-method
FileToken.prototype.toHtmlInternal = function(): string {
	return f2.call(this).replace(re, ' $1="/wikiparser-website/');
};

export default Parser;
