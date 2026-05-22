import fs from 'fs';
import path from 'path';
import {execSync} from 'child_process';
import esbuild from 'esbuild';
import Parser from 'wikiparser-node';
import type {
	Title as TitleBase,
	Token,
	LinkToken as LinkTokenBase,
	TranscludeToken,
	HeadingToken,
	ConfigData,
} from 'wikiparser-node';

declare global {
	interface RegExpConstructor {
		escape(str: string): string;
	}
}
declare abstract class PrivateLinkToken extends LinkTokenBase { // eslint-disable-line @typescript-eslint/no-unused-vars
	toHtmlInternal(): string;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare abstract class PrivateHeadingToken extends HeadingToken {
	toHtmlInternal(): string;
}

/**
 * Get the file path for a given page.
 * @param dir wiki directory
 * @param title page title
 */
const getFile = (dir: string, title: string | TitleBase): string => {
	const isTitle = typeof title !== 'string';
	return path.join('wiki', dir, (isTitle ? title.title : title) + (isTitle ? '.wiki' : ''));
};

Object.assign(Parser, {internal: true});
Parser.now = new Date('2024-11-26T12:00:00Z');

export default (dir: string, cfg: string): typeof Parser => {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
	Parser.config = cfg as string | ConfigData;

	// Set custom article path
	Parser.getConfig();
	Object.assign(Parser.config, {
		articlePath: `/wikiparser-website/${dir}/`,
		server: '//bhsd-harry.github.io',
	});

	// Set wiki template directory
	Parser.templateDir = path.resolve('wiki', dir);
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
			'#contentmodel',
			'canonical',
			(ns === 10 ? '' : 'Template:') + title,
		);
		if (contentmodel !== 'sanitized-css') {
			return `<strong class="error">Page [[:${
				title
			}]] must have content model "sanitized-css" for TemplateStyles (current model is "${
				contentmodel
			}").</strong>`;
		}
		const styles = templatestyles.getOrInsert(token.getRootNode(), new Set());
		if (styles.has(src)) {
			return '';
		}
		styles.add(src);
		try {
			return `<style>${
				esbuild.transformSync(
					fs.readFileSync(getFile(dir, title), 'utf8'),
					{loader: 'css', minify: true, legalComments: 'none'},
				).code.trim()
			}</style>`;
		} catch {
			return `<strong class="error">Page [[:${title}]] has no content.</strong>`;
		}
	});

	// Hook to render `{{#ifexist:}}`
	(Parser.config as ConfigData).functionHook.push('my_ifexist');
	(Parser.config as ConfigData).parserFunction[0]['#ifexist'] = 'my_ifexist';
	Parser.setFunctionHook('my_ifexist', token => {
		const page = token.getValue(1)!,
			no = token.getValue(3) ?? '';
		try {
			const result = Parser.callParserFunction('ifexist', page, 'y');
			if (!result) {
				return no;
			}
		} catch (e) {
			if (
				Error.isError(e)
				&& e.message.startsWith('Unable to resolve built-in parser function: ifexist')
			) {
				// @ts-expect-error private method
				Parser.error(`Error checking existence of page: ${page}`);
				return no;
			}
			throw e;
		}
		return fs.existsSync(getFile(dir, Parser.normalizeTitle(page))) ? token.getValue(2) ?? '' : no;
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
		for (const k in frame.args) {
			table += `
			${indent}[${toLuaString(k, true)}] = ${toLuaString(frame.args[k]!)},`;
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
		const {module: m, function: f} = token,
			p = path.join('wiki', dir, `${m}.lua`);
		if (fs.existsSync(p)) {
			fs.writeFileSync(
				'frame.lua',
				`return {${frameToLuaTable(token.getFrame(context))}
	}`,
			);
			return execSync(`lua Scribunto.lua "${p.slice(0, -4)}" "${f}"`, {encoding: 'utf8'})
				.replace(/\n$/u, '');
		}
		return `<strong class="error">Script error: No such module "${m}".</strong>`;
	});

	// Override file URLs
	// @ts-expect-error private method
	const {Title}: {Title: typeof TitleBase} = Parser.require('./lib/title');
	Title.prototype.getFileUrl = function(): string {
		return this.getUrl();
	};

	// Render red links with "new" class
	// @ts-expect-error private method
	const {LinkBaseToken}: {LinkBaseToken: typeof PrivateLinkToken} = Parser.require('./src/link/base');
	const linkTypes = new Set(['link', 'category', 'redirect-target']),
		f1 = LinkBaseToken.prototype.toHtmlInternal; // eslint-disable-line @typescript-eslint/unbound-method
	LinkBaseToken.prototype.toHtmlInternal = function(): string {
		const {type, selfLink, link} = this;
		if (linkTypes.has(type)) {
			let html = f1.call(this);
			if (cfg === 'github') {
				if (link.title.startsWith('Mailto:')) {
					return html.replace(/ title=".+?"/u, '').replace(
						new RegExp(` href="/wikiparser-website/${dir}/Mailto%3A(.+?)"`, 'u'),
						(_, p1: string) => ` class="external" rel="nofollow" href="mailto:${decodeURIComponent(p1)}"`,
					);
				}
				html = html.replace(
					new RegExp(` href="/wikiparser-website/${dir}/(.+?)(?=")`, 'u'),
					'$&.html',
				);
			}
			if (selfLink || fs.existsSync(getFile(dir, link))) {
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

	// Override section anchors
	if (cfg === 'github') {
		// @ts-expect-error private method
		const {HeadingToken}: {HeadingToken: typeof PrivateHeadingToken} = Parser.require('./src/heading');
		const f2 = HeadingToken.prototype.toHtmlInternal; // eslint-disable-line @typescript-eslint/unbound-method
		HeadingToken.prototype.toHtmlInternal = function(): string {
			const html = f2.call(this);
			return html.replace(
				/(?<= id=")[^"]+/u,
				m => m.replaceAll(/&amp;|\W/gu, '')
					.replaceAll('_', '-')
					.toLowerCase(),
			);
		};
	}

	return Parser;
};
