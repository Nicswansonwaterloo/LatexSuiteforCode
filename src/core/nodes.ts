/*
 * Portions adapted from Obsidian LaTeX Suite's LuaSnip-style node API:
 * https://github.com/artisticat1/obsidian-latex-suite/tree/main/src/snippets/luasnip_api
 * Copyright its contributors, MIT licensed.
 */

/** A VS Code/editor-independent description of a snippet placeholder. */
export interface TabstopSpec {
	/** Nested tabstops use a path such as `[2, 1]`. */
	index: readonly number[];
	from: number;
	to: number;
}

export interface Captures {
	/** Positional captures exclude the regex's full match, as in upstream. */
	match: readonly (string | undefined)[];
	groups: Readonly<Record<string, string | undefined>>;
}

export interface InsertOptions {
	captures: Captures;
}

/** Upstream compatibility alias. */
export type Options = InsertOptions;

export const emptyInsertOptions: InsertOptions = {
	captures: { match: [], groups: {} },
};

export interface ResultInsert {
	insert: string;
	tabstops: readonly TabstopSpec[];
}

export type NodeInsert =
	| string
	| ((context: InsertOptions) => string | BaseNode[]);

export class BaseNode {
	constructor(
		public insert: NodeInsert,
		public tabstops: readonly TabstopSpec[] = [],
	) {}

	applyInsert(options: InsertOptions = emptyInsertOptions): ResultInsert {
		if (typeof this.insert === "string") {
			return { insert: this.insert, tabstops: this.tabstops };
		}

		const result = this.insert(options);
		if (typeof result === "string") {
			return { insert: result, tabstops: this.tabstops };
		}

		let offset = 0;
		const pieces = result.map((node) => {
			const applied = node.applyInsert(options);
			const currentOffset = offset;
			offset += applied.insert.length;
			return {
				insert: applied.insert,
				tabstops: [
					...applied.tabstops.map((tabstop) => ({
						...tabstop,
						from: tabstop.from + currentOffset,
						to: tabstop.to + currentOffset,
					})),
					...this.tabstops.map((tabstop) => ({
						...tabstop,
						from: tabstop.from + currentOffset,
						to: tabstop.to + currentOffset,
					})),
				],
			};
		});

		return {
			insert: pieces.map((piece) => piece.insert).join(""),
			tabstops: pieces.flatMap((piece) => piece.tabstops),
		};
	}
}

export class TextNode extends BaseNode {
	constructor(text: string) {
		super(text);
	}
}

export class TabstopNode extends BaseNode {
	constructor(index: number, insert = "") {
		super(insert, [{ index: [index], from: 0, to: insert.length }]);
	}
}

export class CaptureNode extends BaseNode {
	constructor(key: number | string, defaultValue = "") {
		if (typeof key === "number") {
			super(({ captures }) => captures.match[key] ?? defaultValue);
		} else {
			super(({ captures }) => captures.groups[key] ?? defaultValue);
		}
	}
}

export interface Replacement {
	start: number;
	end: number;
	replacement: string;
}

export function applyReplacements(
	value: string,
	replacements: readonly Replacement[],
): string {
	const sorted = [...replacements].sort((a, b) => a.start - b.start);
	let offset = 0;
	const parts: string[] = [];
	for (const replacement of sorted) {
		parts.push(
			value.slice(offset, replacement.start),
			replacement.replacement,
		);
		offset = replacement.end;
	}
	return parts.join("") + value.slice(offset);
}

/** A tabstop containing child nodes. Kept compatible with the upstream API. */
export class SnippetNode extends BaseNode {
	constructor(
		private readonly index: number,
		private readonly nodes: BaseNode[],
	) {
		super("");
	}

	override applyInsert(
		options: InsertOptions = emptyInsertOptions,
	): ResultInsert {
		const result = new ArrayNode(this.nodes).applyInsert(options);
		return {
			insert: result.insert,
			tabstops: [
				{ index: [this.index], from: 0, to: result.insert.length },
				...result.tabstops.map((tabstop) => ({
					...tabstop,
					index: [this.index, ...tabstop.index],
				})),
			],
		};
	}
}

/** Parses upstream replacement syntax: `[[0]]`, `$1`, and `${1:default}`. */
export class SnippetStringNode extends BaseNode {
	constructor(private readonly snippet: string) {
		super((options) => this.parseSnippet(options.captures));
	}

	parseSnippet(captures: Captures): BaseNode[] {
		return this.expandTabstops(this.expandCaptures(captures));
	}

	expandCaptures(captures: Captures): string {
		const replacements: Replacement[] = [];
		for (const match of this.snippet.matchAll(/\[\[(\d+)\]\]/g)) {
			const index = Number.parseInt(match[1], 10);
			if (index >= captures.match.length || match.index === undefined) {
				continue;
			}
			replacements.push({
				start: match.index,
				end: match.index + match[0].length,
				replacement: captures.match[index] ?? "",
			});
		}
		return applyReplacements(this.snippet, replacements);
	}

	expandTabstops(snippet: string): BaseNode[] {
		// The one-digit unbraced form is intentional and matches upstream.
		const pattern = /\$(\d)|\$\{(\d+):([^}]*)\}/g;
		const nodes: BaseNode[] = [];
		let offset = 0;
		for (const match of snippet.matchAll(pattern)) {
			if (match.index === undefined) {
				continue;
			}
			const index = Number.parseInt(match[1] || match[2], 10);
			nodes.push(new TextNode(snippet.slice(offset, match.index)));
			nodes.push(new TabstopNode(index, match[3] || ""));
			offset = match.index + match[0].length;
		}
		nodes.push(new TextNode(snippet.slice(offset)));
		return nodes;
	}
}

export const VISUAL_PLACEHOLDER = "${VISUAL}";
export const VISUAL_ORIGINAL_PLACEHOLDER = "${VISUAL_ORIGINAL}";

export class VisualSnippetNode extends BaseNode {
	constructor(public readonly snippet: string) {
		super((options) =>
			new SnippetStringNode(this.expandVisual(options.captures)).parseSnippet({
				match: [],
				groups: {},
			}),
		);
	}

	expandVisual(captures: Captures): string {
		const visual = captures.groups[VISUAL_PLACEHOLDER];
		if (visual === undefined) {
			throw new Error(
				`VisualSnippetNode requires capture group ${VISUAL_PLACEHOLDER}`,
			);
		}
		return this.snippet
			.replaceAll(VISUAL_ORIGINAL_PLACEHOLDER, captures.groups[VISUAL_ORIGINAL_PLACEHOLDER] ?? visual)
			.replaceAll(VISUAL_PLACEHOLDER, visual);
	}
}

/** Parses tabstops but deliberately does not interpret regex captures. */
export class SnippetTabstopOnlyNode extends BaseNode {
	constructor(snippet: string) {
		super(() =>
			new SnippetStringNode(snippet).parseSnippet({ match: [], groups: {} }),
		);
	}
}

export class ArrayNode {
	constructor(private readonly children: BaseNode[]) {}

	applyInsert(options: InsertOptions = emptyInsertOptions): ResultInsert {
		return new BaseNode(() => this.children).applyInsert(options);
	}
}

export function tabstop_node(index: number, insert = ""): TabstopNode {
	return new TabstopNode(index, insert);
}

export function text_node(text: string): TextNode {
	return new TextNode(text);
}

export function capture_node(
	captureName: string | number,
	defaultValue = "",
): CaptureNode {
	return new CaptureNode(captureName, defaultValue);
}

export function snippet_node(snippet: string): SnippetStringNode {
	return new SnippetStringNode(snippet);
}

export function array_node(nodes: BaseNode[]): ArrayNode {
	return new ArrayNode(nodes);
}

export interface LatexSuiteApi {
	snippetVariables: Readonly<Record<string, string>>;
	tabstop_node: typeof tabstop_node;
	text_node: typeof text_node;
	capture_node: typeof capture_node;
	snippet_node: typeof snippet_node;
	array_node: typeof array_node;
	/** Mutable for compatibility with upstream snippet files that call `.push()`. */
	ALL_MACROS: string[];
}

export interface LatexSuiteApiOptions {
	snippetVariables?: Readonly<Record<string, string>>;
	/** Kept by reference so snippet files may extend it with `.push()`. */
	allMacros?: string[];
}

/** Empty by default; the extension host supplies the upstream macro catalogue. */
export const ALL_MACROS: string[] = [];

/** Builds the object returned by `require("latex-suite")` in snippet modules. */
export function createLatexSuiteApi(
	options: LatexSuiteApiOptions = {},
): LatexSuiteApi {
	return {
		snippetVariables: options.snippetVariables ?? {},
		tabstop_node,
		text_node,
		capture_node,
		snippet_node,
		array_node,
		ALL_MACROS: options.allMacros ?? ALL_MACROS,
	};
}

/** Upstream factory signature retained for loaders ported from LaTeX Suite. */
export function api(
	snippetVariables: Readonly<Record<string, string>> = {},
	allMacros: string[] = ALL_MACROS,
): LatexSuiteApi {
	return createLatexSuiteApi({ snippetVariables, allMacros });
}

/** Convenience default; adapters should normally call `createLatexSuiteApi`. */
export const snippetApi = createLatexSuiteApi();
