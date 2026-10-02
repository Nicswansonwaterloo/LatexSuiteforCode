/*
 * Snippet parsing and matching behavior is adapted from Obsidian LaTeX Suite:
 * https://github.com/artisticat1/obsidian-latex-suite/tree/main/src/snippets
 * Copyright its contributors, MIT licensed.
 *
 * This port intentionally has no dependency on VS Code, CodeMirror, or Valibot.
 */

import {
	ArrayNode,
	BaseNode,
	SnippetStringNode,
	SnippetTabstopOnlyNode,
	VisualSnippetNode,
	type InsertOptions,
	type ResultInsert,
	VISUAL_ORIGINAL_PLACEHOLDER,
	VISUAL_PLACEHOLDER,
} from "./nodes";

export { VISUAL_PLACEHOLDER };
export const VISUAL_SNIPPET_MAGIC_SELECTION_PLACEHOLDER = VISUAL_PLACEHOLDER;
export const REGEX_LOOKBEHIND_LIMIT = 8_192;

export type SnippetType = "visual" | "regex" | "string";
export type SnippetVariables = Record<string, string>;
export const OPTION_FLAGS = "tmMnArvw cCTU".replace(" ", "");

export interface MacroArea {
	name: string;
	/** Zero-based macro argument indexes, matching upstream. */
	arguments?: number[];
}

export type RawMacroArea = string | MacroArea;

export type FunctionReplacementResult = string | BaseNode[] | false;

export interface ReplacementFunctionApi<Adapter = unknown> {
	/** Host-owned adapter object; the core never inspects it. */
	adapter: Adapter | undefined;
	/** Compatibility alias for upstream functions that name this value `view`. */
	view: Adapter | undefined;
	options: InsertOptions;
}

export type RawReplacement<Adapter = unknown> =
	| string
	| BaseNode[]
	| ((
		match: string | RegExpExecArray,
		api: ReplacementFunctionApi<Adapter>,
	) => unknown);

export interface RawSnippet<Adapter = unknown> {
	trigger?: string | RegExp;
	triggerAfter?: string | RegExp;
	replacement: RawReplacement<Adapter>;
	options: string;
	flags?: string;
	priority?: number;
	description?: string;
	triggerKey?: string;
	language?: string;
	excludedMacros?: RawMacroArea[];
	excludedEnvironments?: string[];
	includedMacros?: RawMacroArea[];
}

export class Mode {
	text = false;
	inlineMath = false;
	blockMath = false;
	codeMath = false;
	codeBlock: string | boolean = false;
	code = false;
	textEnv = false;
	snippetlessEnv = false;

	static fromSource(source: string, language?: string): Mode {
		const mode = new Mode();
		for (const flag of source) {
			switch (flag) {
				case "m":
					mode.blockMath = true;
					mode.inlineMath = true;
					break;
				case "n":
					mode.inlineMath = true;
					break;
				case "M":
					mode.blockMath = true;
					break;
				case "t":
					mode.text = true;
					break;
				case "T":
					mode.textEnv = true;
					break;
				case "c":
					mode.codeBlock = true;
					break;
				case "C":
					mode.code = true;
					break;
			}
		}

		if (language !== undefined) {
			mode.codeBlock = language;
		}
		if (mode.textEnv && !(mode.blockMath || mode.inlineMath)) {
			mode.blockMath = true;
			mode.inlineMath = true;
		}
		if (!mode.hasExplicitMode()) {
			mode.invert();
		}
		return mode;
	}

	inEquation(): boolean {
		return this.inlineMath || this.blockMath;
	}

	inMath(): boolean {
		return this.inlineMath || this.blockMath || this.codeMath;
	}

	inDisplayMath(): boolean {
		return this.blockMath || this.codeMath;
	}

	strictlyInMath(): boolean {
		return this.inMath() && !this.textEnv && !this.snippetlessEnv;
	}

	invert(): void {
		this.text = !this.text;
		this.inlineMath = !this.inlineMath;
		this.blockMath = !this.blockMath;
		this.codeMath = !this.codeMath;
		this.codeBlock = this.codeBlock === false;
		this.code = !this.code;
		this.textEnv = !this.textEnv;
		this.snippetlessEnv = !this.snippetlessEnv;
	}

	copy(): Mode {
		return Object.assign(new Mode(), this);
	}

	private hasExplicitMode(): boolean {
		return Boolean(
			this.text ||
				this.inlineMath ||
				this.blockMath ||
				this.codeMath ||
				this.codeBlock !== false ||
				this.textEnv ||
				this.code,
		);
	}
}

export class SnippetOptions {
	constructor(
		public mode: Mode,
		public automatic: boolean,
		public regex: boolean,
		public onWordBoundary: boolean,
		public visual: boolean,
		public undoKey: boolean,
	) {}

	static fromSource(source: string, language?: string): SnippetOptions {
		return new SnippetOptions(
			Mode.fromSource(source, language),
			source.includes("A"),
			source.includes("r"),
			source.includes("w"),
			source.includes("v"),
			!source.includes("U"),
		);
	}

	snippetShouldRunInMode(
		mode: ModeLike,
		ignoreSnippetlessEnvironment = false,
	): boolean {
		if (mode.snippetlessEnv && !ignoreSnippetlessEnvironment) {
			return false;
		}
		if (
			(this.mode.inlineMath && mode.inlineMath) ||
			(this.mode.blockMath && mode.blockMath) ||
			((this.mode.inlineMath || this.mode.blockMath) && mode.codeMath)
		) {
			if (mode.textEnv === this.mode.textEnv) {
				return true;
			}
		}
		if (this.mode.text && mode.text) {
			return true;
		}
		if (
			(this.mode.codeBlock === mode.codeBlock && mode.codeBlock !== false) ||
			(this.mode.codeBlock === true && mode.codeBlock !== false)
		) {
			return true;
		}
		if (this.mode.code && mode.code) {
			return true;
		}
		return false;
	}

	copy(): SnippetOptions {
		return new SnippetOptions(
			this.mode.copy(),
			this.automatic,
			this.regex,
			this.onWordBoundary,
			this.visual,
			this.undoKey,
		);
	}
}

export interface ModeLike {
	text: boolean;
	inlineMath: boolean;
	blockMath: boolean;
	codeMath: boolean;
	codeBlock: string | boolean;
	code: boolean;
	textEnv: boolean;
	snippetlessEnv: boolean;
}

export type ScopeFrame =
	| { kind: "environment"; name: string }
	| { kind: "math" }
	| {
		kind: "command" | "macro";
		name: string;
		/** Zero-based argument index when known. */
		argument?: number;
		argumentIndex?: number;
		/** Scanner frames distinguish required arguments from optional brackets. */
		requiredArgumentIndex?: number | null;
	};

export enum IncludedScopeResult {
	None,
	Included,
	NotIncluded,
}

/** Upstream compatibility alias. */
export const IncludedEnvironmentResult = IncludedScopeResult;
export type IncludedEnvironmentResult = IncludedScopeResult;

export type ParsedReplacement<Adapter = unknown> =
	| ArrayNode
	| ((
		match: string | RegExpExecArray,
		api: ReplacementFunctionApi<Adapter>,
	) => unknown);

export class Snippet<Adapter = unknown> {
	constructor(
		public readonly type: SnippetType,
		public readonly trigger: string | RegExp,
		public readonly replacement: ParsedReplacement<Adapter>,
		public readonly options: SnippetOptions,
		public readonly priority: number,
		public readonly description: string,
		public readonly triggerKey: string,
		public readonly triggerAfter: string | RegExp | undefined,
		public readonly excludedEnvironments: string[],
		public readonly excludedMacros: MacroArea[],
		public readonly includedMacros: MacroArea[],
		public readonly source: RawSnippet<Adapter>,
		/** Stable input order used only as the last sort key. */
		public readonly sourceOrder: number,
	) {}

	isWithinExcludedScope(stack: readonly ScopeFrame[]): boolean {
		if (
			this.excludedEnvironments.length === 0 &&
			this.excludedMacros.length === 0
		) {
			return false;
		}
		for (const frame of stack) {
			if (frame.kind === "environment") {
				if (this.excludedEnvironments.includes(frame.name)) {
					return true;
				}
				// Environments do not end an enclosing macro's scope.
				continue;
			}
			if (frame.kind === "math") {
				return false;
			}
			if (matchesMacroArea(frame, this.excludedMacros)) {
				return true;
			}
		}
		return false;
	}

	isWithinIncludedScope(stack: readonly ScopeFrame[]): IncludedScopeResult {
		if (this.includedMacros.length === 0) {
			return IncludedScopeResult.None;
		}
		const frame = stack.find((candidate) => candidate.kind !== "environment");
		if (frame === undefined || frame.kind === "math") {
			return IncludedScopeResult.NotIncluded;
		}
		return matchesMacroArea(frame, this.includedMacros)
			? IncludedScopeResult.Included
			: IncludedScopeResult.NotIncluded;
	}

	toString(): string {
		return serializeSnippetLike({
			type: this.type,
			trigger: this.trigger,
			replacement: this.replacement,
			options: this.options,
			priority: this.priority,
			description: this.description,
			excludedEnvironments: this.excludedEnvironments,
			excludedMacros: this.excludedMacros,
		});
	}
}

function matchesMacroArea(
	frame: Extract<ScopeFrame, { kind: "command" | "macro" }>,
	areas: readonly MacroArea[],
): boolean {
	const area = areas.find((candidate) => candidate.name === frame.name);
	if (area === undefined) {
		return false;
	}
	if (area.arguments === undefined) {
		return true;
	}
	const argument = frame.requiredArgumentIndex !== undefined
		? frame.requiredArgumentIndex
		: frame.argument ?? frame.argumentIndex;
	return argument !== null && argument !== undefined && area.arguments.includes(argument);
}

const DEFAULT_EXCLUDED_MACROS: Readonly<Record<string, readonly MacroArea[]>> = {
	"([A-Za-z])(\\d)": [{ name: "ce" }, { name: "pu" }],
	"->": [{ name: "ce" }],
};

const rawSources = new WeakMap<object, RawSnippet>();

export function validateRawSnippets<Adapter = unknown>(
	value: unknown,
): RawSnippet<Adapter>[] {
	if (!Array.isArray(value)) {
		throw new Error("Expected snippets to be an array");
	}
	return value.flat().map((candidate, index) => {
		try {
			return validateRawSnippet<Adapter>(candidate);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Value does not resemble snippet at index ${index}: ${message}\n` +
					`Erroring snippet:\n${serializeSnippetLike(candidate)}`,
			);
		}
	});
}

function validateRawSnippet<Adapter>(value: unknown): RawSnippet<Adapter> {
	if (!isRecord(value)) {
		throw new Error("expected an object");
	}
	if (
		value.trigger !== undefined &&
		typeof value.trigger !== "string" &&
		!(value.trigger instanceof RegExp)
	) {
		throw new Error("trigger must be a string or RegExp");
	}
	if (
		value.triggerAfter !== undefined &&
		typeof value.triggerAfter !== "string" &&
		!(value.triggerAfter instanceof RegExp)
	) {
		throw new Error("triggerAfter must be a string or RegExp");
	}
	if (typeof value.options !== "string") {
		throw new Error("options must be a string");
	}
	if (!isRawReplacement(value.replacement)) {
		throw new Error("replacement must be a string, function, or BaseNode array");
	}
	assertOptionalType(value, "flags", "string");
	assertOptionalType(value, "priority", "number");
	assertOptionalType(value, "description", "string");
	assertOptionalType(value, "triggerKey", "string");
	assertOptionalType(value, "language", "string");
	if (
		value.priority !== undefined &&
		(typeof value.priority !== "number" || !Number.isFinite(value.priority))
	) {
		throw new Error("priority must be a finite number");
	}

	const result: RawSnippet<Adapter> = {
		trigger: value.trigger as string | RegExp | undefined,
		triggerAfter: value.triggerAfter as string | RegExp | undefined,
		replacement: value.replacement as RawReplacement<Adapter>,
		options: value.options,
		flags: (value.flags as string | undefined) ?? "",
		priority: (value.priority as number | undefined) ?? 0,
		description:
			(value.description as string | undefined) ?? "no description provided",
		triggerKey: (value.triggerKey as string | undefined) ?? "",
		language: value.language as string | undefined,
		excludedMacros: validateMacroAreas(value.excludedMacros, "excludedMacros"),
		excludedEnvironments: validateStringArray(
			value.excludedEnvironments,
			"excludedEnvironments",
		),
		includedMacros: validateMacroAreas(value.includedMacros, "includedMacros"),
	};
	const original = value as unknown as RawSnippet<Adapter>;
	rawSources.set(result, original as RawSnippet);
	return result;
}

function isRawReplacement(value: unknown): boolean {
	return (
		typeof value === "string" ||
		typeof value === "function" ||
		(Array.isArray(value) && value.every((node) => node instanceof BaseNode))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalType(
	value: Record<string, unknown>,
	key: string,
	type: "string" | "number",
): void {
	if (value[key] !== undefined && typeof value[key] !== type) {
		throw new Error(`${key} must be a ${type}`);
	}
}

function validateStringArray(value: unknown, name: string): string[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
		throw new Error(`${name} must be an array of strings`);
	}
	return [...value];
}

function validateMacroAreas(value: unknown, name: string): MacroArea[] {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new Error(`${name} must be an array`);
	}
	return value.map((entry, index) => {
		if (typeof entry === "string") {
			return normalizeMacroArea(entry);
		}
		if (!isRecord(entry) || typeof entry.name !== "string") {
			throw new Error(`${name}[${index}] must be a macro name or object`);
		}
		if (
			entry.arguments !== undefined &&
			(!Array.isArray(entry.arguments) ||
				!entry.arguments.every(
					(argument) => Number.isInteger(argument) && Number(argument) >= 0,
				))
		) {
			throw new Error(`${name}[${index}].arguments must be non-negative integers`);
		}
		return {
			name: entry.name,
			arguments: entry.arguments as number[] | undefined,
		};
	});
}

export interface ParseSnippetOptions {
	/** Controls how the portable `Mod-` spelling is normalized. */
	isMacOS?: boolean;
	/** Additional trigger-to-macro exclusions supplied by the host. */
	exclusions?: Readonly<Record<string, readonly RawMacroArea[]>>;
}

export function normalizeSnippetVariables(
	variables: Readonly<Record<string, unknown>>,
): SnippetVariables {
	if (Array.isArray(variables)) {
		throw new Error("Cannot parse an array as a variables object");
	}
	const normalized: SnippetVariables = {};
	for (const [name, value] of Object.entries(variables)) {
		if (typeof value !== "string") {
			throw new Error(`Snippet variable '${name}' must be a string`);
		}
		if (name.startsWith("${")) {
			if (!name.endsWith("}")) {
				throw new Error(
					`Invalid snippet variable '${name}': missing closing '}'`,
				);
			}
			normalized[name] = value;
		} else {
			if (name.endsWith("}")) {
				throw new Error(
					`Invalid snippet variable '${name}': missing opening '\${'`,
				);
			}
			normalized[`\${${name}}`] = value;
		}
	}
	return normalized;
}

/** Upstream naming alias. Parsing source text itself belongs to the host loader. */
export const parseSnippetVariables = normalizeSnippetVariables;

export function insertSnippetVariables(
	trigger: string,
	variables: Readonly<SnippetVariables>,
): string {
	let result = trigger;
	for (const [variable, replacement] of Object.entries(variables)) {
		result = result.replaceAll(variable, replacement);
	}
	return result;
}

export function parseSnippets<Adapter = unknown>(
	input: unknown,
	variables: Readonly<SnippetVariables> = {},
	options: ParseSnippetOptions = {},
): Snippet<Adapter>[] {
	const rawSnippets = validateRawSnippets<Adapter>(input);
	const parsed = rawSnippets.flatMap((raw, index) => {
		try {
			return parseSnippet(raw, variables, options, index);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`${message}\nErroring snippet:\n${serializeSnippetLike(rawSources.get(raw) ?? raw)}`,
			);
		}
	});
	return sortSnippets(parsed);
}

export function parseSnippet<Adapter = unknown>(
	rawInput: RawSnippet<Adapter>,
	variables: Readonly<SnippetVariables> = {},
	parseOptions: ParseSnippetOptions = {},
	sourceOrder = 0,
): Snippet<Adapter>[] {
	// Validate direct callers too. Avoid cloning a value already produced validated.
	const raw = rawSources.has(rawInput)
		? rawInput
		: validateRawSnippets<Adapter>([rawInput])[0];
	const source = (rawSources.get(raw) as RawSnippet<Adapter> | undefined) ?? raw;
	const options = SnippetOptions.fromSource(raw.options, raw.language);
	const triggerKey = parseKeyName(
		raw.triggerKey ?? "",
		parseOptions.isMacOS ?? false,
	);
	if (raw.trigger === undefined && triggerKey.length === 0) {
		throw new Error("Either trigger or triggerKey must be non-empty");
	}
	const rawTrigger = raw.trigger ?? "";
	const priority = raw.priority ?? 0;
	const description = raw.description ?? "no description provided";
	const excludedEnvironments = raw.excludedEnvironments ?? [];
	const includedMacros = normalizeMacroAreas(raw.includedMacros ?? []);

	if (options.regex || rawTrigger instanceof RegExp) {
		const replacement = normalizeReplacement<Adapter>(raw.replacement, "regex");
		let triggerSource =
			rawTrigger instanceof RegExp ? rawTrigger.source : rawTrigger;
		let flags = raw.flags ?? "";
		if (rawTrigger instanceof RegExp) {
			flags = rawTrigger.flags + flags;
		}
		let afterSource: string | undefined;
		let afterFlags = raw.flags ?? "";
		if (raw.triggerAfter instanceof RegExp) {
			afterSource = raw.triggerAfter.source;
			afterFlags = raw.triggerAfter.flags + afterFlags;
		} else {
			afterSource = raw.triggerAfter;
		}
		triggerSource = insertSnippetVariables(triggerSource, variables);
		afterSource =
			afterSource === undefined
				? undefined
				: insertSnippetVariables(afterSource, variables);
		const excludedMacros = getExcludedMacros(
			triggerSource,
			raw.excludedMacros ?? [],
			parseOptions.exclusions,
		);
		const trigger = makeRegExp(
			rawTrigger,
			`(?:${triggerSource})$`,
			filterRegexFlags(flags),
		);
		const triggerAfter =
			afterSource === undefined
				? undefined
				: makeRegExp(
					raw.triggerAfter,
					`^(?:${afterSource})`,
					filterRegexFlags(afterFlags),
				);
		options.regex = true;
		const snippets: Snippet<Adapter>[] = [
			new Snippet(
				"regex",
				trigger,
				replacement,
				options,
				priority,
				description,
				triggerKey,
				triggerAfter,
				[...excludedEnvironments],
				excludedMacros,
				includedMacros,
				source,
				sourceOrder,
			),
		];
		if (triggerKey && options.automatic) {
			const keyOptions = options.copy();
			keyOptions.automatic = false;
			snippets.push(
				new Snippet(
					"regex",
					/(?:)$/,
					replacement,
					keyOptions,
					priority,
					description,
					triggerKey,
					triggerAfter,
					[...excludedEnvironments],
					excludedMacros,
					includedMacros,
					source,
					sourceOrder,
				),
			);
		}
		return snippets;
	}

	const trigger = insertSnippetVariables(rawTrigger, variables);
	if (raw.triggerAfter instanceof RegExp) {
		throw new Error("triggerAfter cannot be a RegExp for non-regex snippets");
	}
	const triggerAfter =
		raw.triggerAfter === undefined
			? undefined
			: insertSnippetVariables(raw.triggerAfter, variables);
	const excludedMacros = getExcludedMacros(
		trigger,
		raw.excludedMacros ?? [],
		parseOptions.exclusions,
	);
	if (
		typeof raw.replacement === "string" &&
		raw.replacement.includes(VISUAL_PLACEHOLDER) &&
		trigger.length <= 1
	) {
		options.visual = true;
	}

	if (options.visual) {
		if (trigger.length > 1) {
			throw new Error("trigger must be a single character for visual snippets");
		}
		if (trigger.length === 1 && triggerKey.length > 0) {
			throw new Error(
				"trigger and triggerKey cannot both be defined for visual snippets",
			);
		}
		if (trigger.length === 0 && triggerKey.length === 0) {
			throw new Error("Either trigger or triggerKey must be defined");
		}
		const replacement = normalizeReplacement<Adapter>(raw.replacement, "visual");
		options.automatic = false;
		return [
			new Snippet(
				"visual",
				"",
				replacement,
				options,
				priority,
				description,
				trigger || triggerKey,
				triggerAfter,
				[...excludedEnvironments],
				excludedMacros,
				includedMacros,
				source,
				sourceOrder,
			),
		];
	}

	const replacement = normalizeReplacement<Adapter>(raw.replacement, "string");
	const snippets: Snippet<Adapter>[] = [
		new Snippet(
			"string",
			trigger,
			replacement,
			options,
			priority,
			description,
			triggerKey,
			triggerAfter,
			[...excludedEnvironments],
			excludedMacros,
			includedMacros,
			source,
			sourceOrder,
		),
	];
	if (triggerKey && options.automatic) {
		const keyOptions = options.copy();
		keyOptions.automatic = false;
		snippets.push(
			new Snippet(
				"string",
				"",
				replacement,
				keyOptions,
				priority,
				description,
				triggerKey,
				triggerAfter,
				[...excludedEnvironments],
				excludedMacros,
				includedMacros,
				source,
				sourceOrder,
			),
		);
	}
	return snippets;
}

function normalizeReplacement<Adapter>(
	replacement: RawReplacement<Adapter>,
	type: SnippetType,
): ParsedReplacement<Adapter> {
	if (typeof replacement === "function") {
		return replacement;
	}
	if (Array.isArray(replacement)) {
		return new ArrayNode(replacement);
	}
	if (type === "regex") {
		return new ArrayNode([new SnippetStringNode(replacement)]);
	}
	if (type === "visual") {
		return new ArrayNode([new VisualSnippetNode(replacement)]);
	}
	return new ArrayNode([new SnippetTabstopOnlyNode(replacement)]);
}

function getExcludedMacros(
	trigger: string,
	userAreas: readonly RawMacroArea[],
	extraExclusions?: Readonly<Record<string, readonly RawMacroArea[]>>,
): MacroArea[] {
	return [
		...(DEFAULT_EXCLUDED_MACROS[trigger] ?? []),
		...(extraExclusions?.[trigger] ?? []).map(normalizeMacroArea),
		...userAreas.map(normalizeMacroArea),
	].map((area) => ({
		name: area.name,
		arguments: area.arguments === undefined ? undefined : [...area.arguments],
	}));
}

function normalizeMacroAreas(areas: readonly RawMacroArea[]): MacroArea[] {
	return areas.map(normalizeMacroArea);
}

function normalizeMacroArea(area: RawMacroArea): MacroArea {
	return typeof area === "string"
		? { name: area, arguments: [0] }
		: {
			name: area.name,
			arguments: area.arguments === undefined ? undefined : [...area.arguments],
		};
}

function filterRegexFlags(flags: string): string {
	const valid = new Set(["i", "m", "s", "u", "v"]);
	return [...new Set(flags)].filter((flag) => valid.has(flag)).join("");
}

function makeRegExp(
	original: string | RegExp | undefined,
	source: string,
	flags: string,
): RegExp {
	if (!(original instanceof RegExp) || original.constructor === RegExp) {
		return new RegExp(source, flags);
	}
	const Constructor = original.constructor as unknown as new (
		pattern: string,
		flags?: string,
	) => RegExp;
	return new Constructor(source, flags);
}

export function parseKeyName(name: string, isMacOS = false): string {
	return name
		.split(/ (?!$)/)
		.map((part) => normalizeKeyName(part, isMacOS))
		.join(" ");
}

function normalizeKeyName(name: string, isMacOS: boolean): string {
	const parts = name.split(/-(?!$)/);
	let result = parts.at(-1) ?? "";
	if (result === "Space") {
		result = " ";
	}
	let alt = false;
	let ctrl = false;
	let shift = false;
	let meta = false;
	for (const modifier of parts.slice(0, -1)) {
		if (/^(cmd|meta|m)$/i.test(modifier)) {
			meta = true;
		} else if (/^a(lt)?$/i.test(modifier)) {
			alt = true;
		} else if (/^(c|ctrl|control)$/i.test(modifier)) {
			ctrl = true;
		} else if (/^s(hift)?$/i.test(modifier)) {
			shift = true;
		} else if (/^mod$/i.test(modifier)) {
			if (isMacOS) {
				meta = true;
			} else {
				ctrl = true;
			}
		} else {
			throw new Error(`Unrecognized modifier name: ${modifier}`);
		}
	}
	if (alt) {
		result = `Alt-${result}`;
	}
	if (ctrl) {
		result = `Ctrl-${result}`;
	}
	if (meta) {
		result = `Meta-${result}`;
	}
	if (shift) {
		result = `Shift-${result}`;
	}
	return result;
}

export function sortSnippets<Adapter>(
	snippets: readonly Snippet<Adapter>[],
): Snippet<Adapter>[] {
	return snippets
		.map((snippet, stableIndex) => ({
			snippet,
			stableIndex,
			triggerLength:
				typeof snippet.trigger === "string"
					? snippet.trigger.length
					: snippet.trigger.source.length,
		}))
		.sort(
			(a, b) =>
				b.snippet.priority - a.snippet.priority ||
				b.triggerLength - a.triggerLength ||
				a.stableIndex - b.stableIndex,
		)
		.map(({ snippet }) => snippet);
}

export interface MatchContext<Adapter = unknown> {
	/** Text before the caret (or before a visual selection). */
	before: string;
	/** Text after the caret (or after a visual selection). */
	after?: string;
	/** Parsed selection passed to `${VISUAL}` and visual functions. */
	selection?: string;
	/** Original selection passed to `${VISUAL_ORIGINAL}`. */
	originalSelection?: string;
	mode?: ModeLike;
	/** Innermost-first macro/environment stack. */
	scopes?: readonly ScopeFrame[];
	/** If set, filters automatic (`true`) versus manual (`false`) snippets. */
	automatic?: boolean;
	/** A normalized key name such as `Ctrl-Enter` or `(`. */
	triggerKey?: string;
	/** Characters considered boundaries for the `w` option. */
	wordDelimiters?: string;
	adapter?: Adapter;
}

export interface SnippetMatch<Adapter = unknown> {
	snippet: Snippet<Adapter>;
	replacement: ResultInsert;
	/** Offsets are relative to `before + originalSelection + after`. */
	replaceStart: number;
	replaceEnd: number;
	matchedText: string;
	captures: InsertOptions["captures"];
}

export function matchSnippet<Adapter = unknown>(
	snippet: Snippet<Adapter>,
	context: MatchContext<Adapter>,
): SnippetMatch<Adapter> | null {
	if (!matchesScope(snippet, context)) {
		return null;
	}
	const trigger = matchTrigger(snippet, context);
	if (!trigger) {
		return null;
	}
	let replacement = applyReplacement(snippet, trigger.argument, trigger.captures, context.adapter);
	if (replacement === null) {
		return null;
	}
	if (snippet.type === "visual" && replacement.tabstops.length === 0) {
		replacement = {
			insert: replacement.insert,
			tabstops: [{ index: [0], from: 0, to: replacement.insert.length }],
		};
	}
	const { argument: _argument, ...matched } = trigger;
	return { snippet, replacement, ...matched };
}

export function matchFirstSnippet<Adapter = unknown>(
	snippets: readonly Snippet<Adapter>[],
	context: MatchContext<Adapter>,
): SnippetMatch<Adapter> | null {
	for (const snippet of snippets) {
		const result = matchSnippet(snippet, context);
		if (result !== null) {
			return result;
		}
	}
	return null;
}

/**
 * Test only the parts of a snippet match that can be decided from the text
 * around the caret. Scope and mode are deliberately ignored so callers can
 * cheaply prefilter before parsing document context. Programmable
 * replacements are never evaluated.
 */
export function canMatchSnippetTrigger<Adapter = unknown>(
	snippet: Snippet<Adapter>,
	context: MatchContext<Adapter>,
): boolean {
	return matchTrigger(snippet, context) !== null;
}

export function canMatchAnySnippetTrigger<Adapter = unknown>(
	snippets: readonly Snippet<Adapter>[],
	context: MatchContext<Adapter>,
): boolean {
	return snippets.some((snippet) => canMatchSnippetTrigger(snippet, context));
}

/**
 * Test trigger/scope eligibility without evaluating a programmable
 * replacement. This is safe for UI context-key refreshes.
 */
export function canMatchSnippet<Adapter = unknown>(
	snippet: Snippet<Adapter>,
	context: MatchContext<Adapter>,
): boolean {
	return matchesScope(snippet, context) && canMatchSnippetTrigger(snippet, context);
}

function matchesScope<Adapter>(snippet: Snippet<Adapter>, context: MatchContext<Adapter>): boolean {
	const scopes = context.scopes ?? [];
	const included = snippet.isWithinIncludedScope(scopes);
	return included !== IncludedScopeResult.NotIncluded &&
		(context.mode === undefined || snippet.options.snippetShouldRunInMode(
			context.mode,
			included === IncludedScopeResult.Included,
		)) && !snippet.isWithinExcludedScope(scopes);
}

export function canMatchAnySnippet<Adapter = unknown>(
	snippets: readonly Snippet<Adapter>[],
	context: MatchContext<Adapter>,
): boolean {
	return snippets.some((snippet) => canMatchSnippet(snippet, context));
}

/** Concise alias for adapters that already operate on sorted snippet lists. */
export const matchFirst = matchFirstSnippet;

interface TriggerMatch {
	argument: string | RegExpExecArray;
	replaceStart: number;
	replaceEnd: number;
	matchedText: string;
	captures: InsertOptions["captures"];
}

/** Resolve the complete match before running any user replacement code. */
function matchTrigger<Adapter>(snippet: Snippet<Adapter>, context: MatchContext<Adapter>): TriggerMatch | null {
	if (
		(context.automatic !== undefined && snippet.options.automatic !== context.automatic) ||
		(context.triggerKey !== undefined && (snippet.triggerKey !== context.triggerKey || snippet.options.automatic))
	) {
		return null;
	}
	// Key-only companions must never run from ordinary typing or Tab.
	if (context.triggerKey === undefined && snippet.triggerKey.length > 0 &&
		(snippet.trigger === "" || (snippet.trigger instanceof RegExp && snippet.trigger.source === "(?:)$"))) {
		return null;
	}
	const after = context.after ?? "";
	const originalSelection = context.originalSelection ?? context.selection ?? "";
	let matched: TriggerMatch;
	if (snippet.type === "visual") {
		if (!originalSelection.length) {
			return null;
		}
		const selection = context.selection ?? originalSelection;
		matched = {
			argument: selection,
			replaceStart: context.before.length,
			replaceEnd: context.before.length + originalSelection.length,
			matchedText: originalSelection,
			captures: { match: [], groups: {
				[VISUAL_PLACEHOLDER]: selection,
				[VISUAL_ORIGINAL_PLACEHOLDER]: originalSelection,
			} },
		};
	} else {
		if (originalSelection.length) {
			return null;
		}
		if (snippet.type === "regex") {
			const result = execRegexTrigger(snippet.trigger as RegExp, context.before);
			if (!result) {
				return null;
			}
			const afterMatch = snippet.triggerAfter instanceof RegExp
				? execRegexFromStart(snippet.triggerAfter, after)
				: null;
			if (snippet.triggerAfter instanceof RegExp && !afterMatch) {
				return null;
			}
			matched = {
				argument: result,
				replaceStart: result.index,
				replaceEnd: context.before.length + (afterMatch?.[0].length ?? 0),
				matchedText: result[0] + (afterMatch?.[0] ?? ""),
				captures: { match: result.slice(1), groups: result.groups ?? {} },
			};
		} else {
			const trigger = snippet.trigger as string;
			if (!context.before.endsWith(trigger) ||
				(typeof snippet.triggerAfter === "string" && !after.startsWith(snippet.triggerAfter))) {
				return null;
			}
			const consumedAfter = typeof snippet.triggerAfter === "string" ? snippet.triggerAfter.length : 0;
			matched = {
				argument: trigger,
				replaceStart: context.before.length - trigger.length,
				replaceEnd: context.before.length + consumedAfter,
				matchedText: trigger + after.slice(0, consumedAfter),
				captures: { match: [trigger], groups: {} },
			};
		}
	}
	if (snippet.options.onWordBoundary && !isOnWordBoundary(
		context.before, after, matched.replaceStart,
		context.wordDelimiters ?? " \\n\t.,;:!?/{}[]()=~$'\"|`<>",
	)) {
		return null;
	}
	return matched;
}

function execRegexTrigger(trigger: RegExp, before: string): RegExpExecArray | null {
	let input = before;
	let offset = 0;
	if (before.length > REGEX_LOOKBEHIND_LIMIT && !hasStartAnchor(trigger.source)) {
		offset = before.length - REGEX_LOOKBEHIND_LIMIT;
		if (
			offset > 0 &&
			isLowSurrogate(before.charCodeAt(offset)) &&
			isHighSurrogate(before.charCodeAt(offset - 1))
		) {
			offset -= 1;
		}
		input = before.slice(offset);
	}
	const result = execRegexFromStart(trigger, input);
	if (result !== null && offset > 0) {
		result.index += offset;
		result.input = before;
	}
	return result;
}

function execRegexFromStart(trigger: RegExp, input: string): RegExpExecArray | null {
	const previousLastIndex = trigger.lastIndex;
	try {
		trigger.lastIndex = 0;
		return trigger.exec(input);
	} finally {
		trigger.lastIndex = previousLastIndex;
	}
}

function hasStartAnchor(source: string): boolean {
	let escaped = false;
	let inCharacterClass = false;
	for (const character of source) {
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === "[") {
			inCharacterClass = true;
			continue;
		}
		if (character === "]") {
			inCharacterClass = false;
			continue;
		}
		if (character === "^" && !inCharacterClass) {
			return true;
		}
	}
	return false;
}

function isHighSurrogate(code: number): boolean {
	return code >= 0xD800 && code <= 0xDBFF;
}

function isLowSurrogate(code: number): boolean {
	return code >= 0xDC00 && code <= 0xDFFF;
}

function applyReplacement<Adapter>(
	snippet: Snippet<Adapter>,
	argument: string | RegExpExecArray,
	captures: InsertOptions["captures"],
	adapter: Adapter | undefined,
): ResultInsert | null {
	const insertOptions: InsertOptions = { captures };
	if (snippet.replacement instanceof ArrayNode) {
		return snippet.replacement.applyInsert(insertOptions);
	}
	const api: ReplacementFunctionApi<Adapter> = {
		adapter,
		view: adapter,
		options: insertOptions,
	};
	const output = snippet.replacement.call(snippet.source, argument, api);
	if (output === false) {
		return null;
	}
	if (typeof output === "string") {
		return new ArrayNode([new SnippetTabstopOnlyNode(output)]).applyInsert(
			insertOptions,
		);
	}
	if (Array.isArray(output) && output.every((node) => node instanceof BaseNode)) {
		return new ArrayNode(output).applyInsert(insertOptions);
	}
	return null;
}

function isOnWordBoundary(
	before: string,
	after: string,
	triggerStart: number,
	wordDelimiters: string,
): boolean {
	const delimiters = wordDelimiters.replace("\\n", "\n");
	const previous = before.slice(Math.max(0, triggerStart - 1), triggerStart);
	const next = after.slice(0, 1);
	return delimiters.includes(previous) && delimiters.includes(next);
}

function replacer(_key: string, value: unknown): unknown {
	if (typeof value === "function") {
		return "[[Function]]";
	}
	if (value instanceof RegExp) {
		return `[[RegExp]]: ${value.toString()}`;
	}
	return value;
}

export function serializeSnippetLike(value: unknown): string {
	return JSON.stringify(value, replacer, 2);
}
