import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
	findMatchingBracket,
	findOpeningBracket,
	getInnerMathBoundsAt,
	isWithinEnvironment,
	isWithinMacro,
	matchesSnippetContext,
	scanContext,
	type CursorContext,
} from "../core/context";
import {
	findTabOutTarget,
	findUnenclosedClosingTarget,
	getMatrixScope,
	matrixExitTarget,
	planAutoFraction,
	planBracketEnlargements,
	planMatrixCell,
	planMatrixNewline,
	type TextEditPlan,
} from "../core/features";
import {
	ArrayNode,
	BaseNode,
	CaptureNode,
	SnippetNode,
	TabstopNode,
	TextNode,
	VisualSnippetNode,
	createLatexSuiteApi,
	type LatexSuiteApi,
} from "../core/nodes";
import {
	IncludedScopeResult,
	REGEX_LOOKBEHIND_LIMIT,
	SnippetOptions,
	canMatchAnySnippetTrigger,
	canMatchSnippetTrigger,
	insertSnippetVariables,
	matchFirstSnippet,
	matchSnippet,
	normalizeSnippetVariables,
	parseKeyName,
	parseSnippet,
	parseSnippets,
	serializeSnippetLike,
	type MatchContext,
} from "../core/snippets";
import { escapeSnippetText, toVscodeSnippet } from "../core/vscodeSnippet";
import { nonEmptyConfiguredPaths, resolveConfiguredUri } from "../snippetRepository";
import { normalizeReplacementEol } from "../editor/edits";
import * as vscode from "vscode";

const fractionOptions = {
	symbol: "\\frac",
	breakingCharacters: "+-=\t",
	excludedRegions: [
		{ open: "^{", close: "}" },
		{ open: "\\pu{", close: "}" },
	],
};

const matrixOptions = {
	environments: ["matrix", "pmatrix", "align"],
	macros: ["eqalign"],
};

suite("snippet source paths", () => {
	test("ignores blank configured paths without rewriting valid entries", () => {
		assert.deepEqual(
			nonEmptyConfiguredPaths(["", " \t ", " snippets.js ", "./snippets"]),
			[" snippets.js ", "./snippets"],
		);
	});

	test("treats native absolute paths as file URIs before parsing URI schemes", () => {
		const absolutePath = path.resolve("src/test/fixtures/representative-snippets.js");
		const resolved = resolveConfiguredUri(
			absolutePath,
			vscode.Uri.file(path.resolve("workspace/document.md")),
		);
		assert.equal(resolved.scheme, "file");
		assert.equal(resolved.toString(), vscode.Uri.file(absolutePath).toString());
	});
});

function atMarker(sourceWithMarker: string, language: "markdown" | "latex" = "markdown"): {
	source: string;
	offset: number;
	context: CursorContext;
} {
	const offset = sourceWithMarker.indexOf("|");
	assert.notEqual(offset, -1, "test source must contain a | cursor marker");
	const source = sourceWithMarker.slice(0, offset) + sourceWithMarker.slice(offset + 1);
	return { source, offset, context: scanContext(source, offset, { language }) };
}

function snippetContext(context: CursorContext, before: string, overrides: Partial<MatchContext> = {}): MatchContext {
	return {
		before,
		mode: context.mode,
		scopes: context.latexStack,
		...overrides,
	};
}

function applyEdits(source: string, edits: readonly TextEditPlan[]): string {
	return [...edits]
		.sort((left, right) => right.start - left.start)
		.reduce((result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end), source);
}

function evaluateModuleFile(relativePath: string, api: LatexSuiteApi = createLatexSuiteApi()): unknown {
	const fixturePath = path.resolve(__dirname, "../../src", relativePath);
	const source = readFileSync(fixturePath, "utf8").replace(/\bexport\s+default\b/, "module.exports.default =");
	const module = { exports: {} as Record<string, unknown> };
	const factory = new Function("require", "module", "exports", `"use strict";\n${source}`) as (
		requireFunction: (request: string) => unknown,
		moduleObject: { exports: Record<string, unknown> },
		exportsObject: Record<string, unknown>,
	) => void;
	factory(
		(request) => {
			assert.equal(request, "latex-suite");
			return api;
		},
		module,
		module.exports,
	);
	return module.exports.default;
}

suite("pure core", () => {
	suite("Markdown and LaTeX context scanning", () => {
		test("classifies Markdown prose, inline math, and display math", () => {
			assert.equal(atMarker("pro|se").context.kind, "text");
			const inline = atMarker("before $x + |y$ after").context;
			assert.equal(inline.kind, "inlineMath");
			assert.equal(inline.mathBounds?.delimiter, "$");
			assert.equal(inline.mode.inlineMath, true);
			const display = atMarker("$$\nx + |y\n$$").context;
			assert.equal(display.kind, "blockMath");
			assert.equal(display.mathBounds?.closed, true);
		});

		test("supports command delimiters and unfinished math while typing", () => {
			assert.equal(atMarker("\\(x + |y\\)").context.kind, "inlineMath");
			const unfinished = atMarker("text $x + |").context;
			assert.equal(unfinished.kind, "inlineMath");
			assert.equal(unfinished.mathBounds?.closed, false);
		});

		test("distinguishes ordinary and configured math fences", () => {
			assert.equal(atMarker("```js\nconst x = |1;\n``` ").context.kind, "codeBlock");
			const fenced = atMarker("```math\nx + |y\n```").context;
			assert.equal(fenced.kind, "codeMath");
			assert.equal(fenced.mode.codeMath, true);
			assert.equal(scanContext("```latex\nx|\n```".replace("|", ""), 10, {
				language: "markdown",
				mathFenceLanguages: ["latex"],
			}).kind, "codeMath");
		});

		test("keeps inline code out of math and recognizes LaTeX comments", () => {
			assert.equal(atMarker("`$x + |y$`").context.kind, "inlineCode");
			assert.equal(atMarker("`$ignored$`$vis|ible$").context.kind, "inlineMath");
			assert.equal(atMarker("text % ordinary |markdown").context.kind, "text");
			assert.equal(atMarker("text % latex |comment", "latex").context.kind, "latexComment");
			assert.equal(atMarker("$x % math |comment$").context.kind, "latexComment");
			assert.equal(atMarker("$% |comment\nx$").context.kind, "latexComment");
			assert.equal(atMarker("```math\n% |comment\n```").context.kind, "latexComment");
		});

		test("scales across many ignored Markdown intervals", () => {
			const source = `${"`$ignored$` ".repeat(10_000)}$vis|ible$`;
			const started = performance.now();
			assert.equal(atMarker(source).context.kind, "inlineMath");
			const elapsed = performance.now() - started;
			assert.ok(elapsed < 1_000, `context scan took ${elapsed.toFixed(0)} ms`);
		});

		test("finds LaTeX math environments in both document languages", () => {
			for (const language of ["markdown", "latex"] as const) {
				const result = atMarker("\\begin{align}\nx &= |y\n\\end{align}", language).context;
				assert.equal(result.kind, "blockMath");
				assert.equal(isWithinEnvironment(result, "align")?.name, "align");
			}
		});

		test("tracks text and snippetless macro argument scopes", () => {
			const text = atMarker("$x + \\text{hello |world}$").context;
			assert.equal(text.mode.textEnv, true);
			assert.equal(isWithinMacro(text, "text")?.requiredArgumentIndex, 0);
			const tag = atMarker("$$x \\tag{eq:|one}$$").context;
			assert.equal(tag.mode.snippetlessEnv, true);
		});

		test("finds balanced brackets and ignores escaped brackets/comments", () => {
			const source = "a{b\\}c{d} % }\n e}";
			assert.equal(findMatchingBracket(source, 1), source.length - 1);
			assert.equal(findOpeningBracket("(a[b]c)", 6), 0);
			assert.equal(findMatchingBracket("{unclosed", 0), null);
		});
	});

	suite("upstream option flags and scopes", () => {
		test("maps t/m/n/M/T/c/C/A/r/w/v/U flags", () => {
			assert.equal(SnippetOptions.fromSource("tA").mode.text, true);
			assert.equal(SnippetOptions.fromSource("m").mode.inEquation(), true);
			assert.deepEqual(
				[SnippetOptions.fromSource("n").mode.inlineMath, SnippetOptions.fromSource("n").mode.blockMath],
				[true, false],
			);
			assert.deepEqual(
				[SnippetOptions.fromSource("M").mode.inlineMath, SnippetOptions.fromSource("M").mode.blockMath],
				[false, true],
			);
			const all = SnippetOptions.fromSource("ArwvU");
			assert.equal(all.automatic, true);
			assert.equal(all.regex, true);
			assert.equal(all.onWordBoundary, true);
			assert.equal(all.visual, true);
			assert.equal(all.undoKey, false);
			assert.equal(SnippetOptions.fromSource("T").mode.textEnv, true);
			assert.equal(SnippetOptions.fromSource("c", "python").mode.codeBlock, "python");
			assert.equal(SnippetOptions.fromSource("C").mode.code, true);
		});

		test("matches mode flags against scanned contexts", () => {
			const prose = atMarker("pro|se").context;
			const inline = atMarker("$x|$").context;
			const display = atMarker("$$x|$$").context;
			const textMacro = atMarker("$\\text{x|}$").context;
			assert.equal(matchesSnippetContext(prose, "t"), true);
			assert.equal(matchesSnippetContext(inline, "n"), true);
			assert.equal(matchesSnippetContext(inline, "M"), false);
			assert.equal(matchesSnippetContext(display, "M"), true);
			assert.equal(matchesSnippetContext(textMacro, "m"), false);
			assert.equal(matchesSnippetContext(textMacro, "T"), true);
		});

		test("honors included and excluded macro/environment scopes", () => {
			const tag = atMarker("$\\tag{x|}$").context;
			assert.equal(matchesSnippetContext(tag, { options: "m" }), false);
			assert.equal(matchesSnippetContext(tag, { options: "m", includedMacros: ["tag"] }), true);
			const fraction = atMarker("$\\frac{x|}{y}$").context;
			assert.equal(matchesSnippetContext(fraction, { options: "m", excludedMacros: [{ name: "frac", arguments: [0] }] }), false);
			assert.equal(matchesSnippetContext(fraction, { options: "m", excludedMacros: [{ name: "frac", arguments: [1] }] }), true);
			const aligned = atMarker("\\begin{align}x|\\end{align}").context;
			assert.equal(matchesSnippetContext(aligned, { options: "m", excludedEnvironments: ["align"] }), false);
		});

		test("exposes scope checks on parsed snippets", () => {
			const snippet = parseSnippet({
				trigger: "x",
				replacement: "y",
				options: "m",
				includedMacros: [{ name: "textcolor", arguments: [1] }],
				excludedEnvironments: ["cases"],
			})[0];
			assert.equal(snippet.isWithinIncludedScope([{ kind: "macro", name: "textcolor", argument: 1 }]), IncludedScopeResult.Included);
			assert.equal(snippet.isWithinIncludedScope([{ kind: "math" }]), IncludedScopeResult.NotIncluded);
			assert.equal(snippet.isWithinExcludedScope([{ kind: "environment", name: "cases" }]), true);
		});
	});

	suite("snippet parsing and matching", () => {
		test("never evaluates replacements rejected by scope, boundaries, or look-ahead", () => {
			let calls = 0;
			const replacement = () => { calls += 1; return "expanded"; };
			const scoped = parseSnippet({ trigger: "probe", replacement, options: "m", excludedMacros: ["ce"] })[0];
			const { source, offset, context } = atMarker("$\\ce{probe|}$");
			assert.equal(matchSnippet(scoped, snippetContext(context, source.slice(0, offset))), null);
			for (const trigger of ["probe", /probe/]) {
				const word = parseSnippet({ trigger, replacement, options: "tw" })[0];
				assert.equal(matchSnippet(word, { before: "aprobe", after: " " }), null);
				assert.equal(matchSnippet(word, { before: " probe", after: "x" }), null);
			}
			const after = parseSnippet({ trigger: /probe/, triggerAfter: /!/, replacement, options: "t" })[0];
			assert.equal(matchSnippet(after, { before: "probe", after: "?" }), null);
			assert.equal(calls, 0);
			assert.equal(matchSnippet(after, { before: "probe", after: "!" })?.replacement.insert, "expanded");
			assert.equal(calls, 1);
		});

		test("string macro selectors cover only the first argument", () => {
			const snippet = parseSnippet({ trigger: "probe", replacement: "ok", options: "m", excludedMacros: ["pu"] })[0];
			for (const [input, expected] of [["$\\pu{probe|}{x}$", null], ["$\\pu{x}{probe|}$", "ok"], ["$\\pu[opt]{probe|}$", null], ["$\\pu[probe|]{x}$", "ok"]] as const) {
				const { source, offset, context } = atMarker(input);
				assert.equal(matchSnippet(snippet, snippetContext(context, source.slice(0, offset)))?.replacement.insert ?? null, expected);
			}
		});

		test("prefilters automatic triggers without requiring included-macro context", () => {
			let replacementCalls = 0;
			const snippet = parseSnippet({
				trigger: /tag/,
				triggerAfter: /\s*\}/,
				replacement: () => {
					replacementCalls += 1;
					return "expanded";
				},
				options: "rmAw",
				includedMacros: [{ name: "text", arguments: [1] }],
			})[0];
			const trigger = snippet.trigger as RegExp;
			const triggerAfter = snippet.triggerAfter as RegExp;
			trigger.lastIndex = 7;
			triggerAfter.lastIndex = 3;

			assert.equal(canMatchSnippetTrigger(snippet, {
				before: " tag",
				after: " }",
				automatic: true,
			}), true);
			assert.equal(replacementCalls, 0);
			assert.equal(trigger.lastIndex, 7);
			assert.equal(triggerAfter.lastIndex, 3);
			assert.equal(canMatchAnySnippetTrigger([snippet], {
				before: " ordinary",
				after: " }",
				automatic: true,
			}), false);
			assert.equal(replacementCalls, 0);
		});

		test("separates automatic and manual expansion", () => {
			const automatic = parseSnippet({ trigger: "sr", replacement: "^{2}", options: "mA" })[0];
			const manual = parseSnippet({ trigger: "sr", replacement: "^{2}", options: "m" })[0];
			const context = atMarker("$xsr|$").context;
			assert.ok(matchSnippet(automatic, snippetContext(context, "$xsr", { automatic: true })));
			assert.equal(matchSnippet(automatic, snippetContext(context, "$xsr", { automatic: false })), null);
			assert.ok(matchSnippet(manual, snippetContext(context, "$xsr", { automatic: false })));
		});

		test("expands literal snippets with upstream tabstops", () => {
			const snippet = parseSnippet({ trigger: "sq", replacement: "\\sqrt{ $0 }$1", options: "mA" })[0];
			const result = matchSnippet(snippet, { before: "sq" });
			assert.deepEqual(result?.replacement, {
				insert: "\\sqrt{  }",
				tabstops: [
					{ index: [0], from: 7, to: 7 },
					{ index: [1], from: 9, to: 9 },
				],
			});
		});

		test("expands regex captures and reports exact replacement ranges", () => {
			const snippet = parseSnippet({ trigger: /(\d)rt/, replacement: "\\sqrt[[[0]]]{ $0 }$1", options: "rmA" })[0];
			const result = matchSnippet(snippet, { before: "$x + 3rt" });
			assert.equal(result?.matchedText, "3rt");
			assert.equal(result?.replaceStart, 5);
			assert.equal(result?.replaceEnd, 8);
			assert.equal(result?.replacement.insert, "\\sqrt[3]{  }");
			assert.deepEqual(result?.captures.match, ["3"]);
		});

		test("bounds unanchored regex lookbehind while preserving absolute offsets", () => {
			const prefix = "a".repeat(REGEX_LOOKBEHIND_LIMIT + 200);
			const snippet = parseSnippet({
				trigger: /(\d)(\d)sum/,
				replacement: (match) => String((match as RegExpExecArray).index),
				options: "rmA",
			})[0];
			const result = matchSnippet(snippet, { before: `${prefix}23sum` });
			assert.equal(result?.replaceStart, prefix.length);
			assert.equal(result?.replacement.insert, String(prefix.length));

			const anchored = parseSnippet({ trigger: /^tail/, replacement: "x", options: "rmA" })[0];
			assert.equal(matchSnippet(anchored, { before: `${prefix}tail` }), null);
		});

		test("avoids pathological default-regex backtracking on long lines", () => {
			const snippet = parseSnippet({
				trigger: /(\\?)([A-Za-z]+)(\d)/,
				replacement: "x",
				options: "rmA",
			})[0];
			const started = performance.now();
			assert.equal(matchSnippet(snippet, { before: "a".repeat(50_000) }), null);
			assert.ok(performance.now() - started < 250);
		});

		test("sorts by priority, then trigger length, then source order", () => {
			const snippets = parseSnippets([
				{ trigger: "x", replacement: "low", options: "m", priority: 0 },
				{ trigger: "long", replacement: "long", options: "m", priority: 0 },
				{ trigger: "z", replacement: "high", options: "m", priority: 5 },
				{ trigger: "same", replacement: "first", options: "m", priority: 0 },
				{ trigger: "same", replacement: "second", options: "m", priority: 0 },
			]);
			assert.deepEqual(snippets.map((snippet) => snippet.source.replacement), ["high", "long", "first", "second", "low"]);
			assert.equal(matchFirstSnippet(snippets, { before: "same" })?.replacement.insert, "first");
		});

		test("enforces word boundaries on both sides", () => {
			const snippet = parseSnippet({ trigger: "and", replacement: "\\cap", options: "wmA" })[0];
			assert.ok(matchSnippet(snippet, { before: " and", after: " " }));
			assert.equal(matchSnippet(snippet, { before: "sand", after: " " }), null);
			assert.equal(matchSnippet(snippet, { before: " and", after: "y" }), null);
		});

		test("supports literal and regex triggerAfter consumption", () => {
			const literal = parseSnippet({ trigger: "sin", triggerAfter: "()", replacement: "\\sin", options: "mA" })[0];
			const literalMatch = matchSnippet(literal, { before: "sin", after: "() + x" });
			assert.equal(literalMatch?.replaceEnd, 5);
			assert.equal(literalMatch?.matchedText, "sin()");
			const regex = parseSnippet({ trigger: /(\d)x/, triggerAfter: /\s*\+/, replacement: "[[0]]X", options: "rmA" })[0];
			const regexMatch = matchSnippet(regex, { before: "2x", after: "  + y" });
			assert.equal(regexMatch?.replacement.insert, "2X");
			assert.equal(regexMatch?.replaceEnd, 5);
		});

		test("lets programmable replacements return string, nodes, or false", () => {
			type Adapter = { id: number };
			const stringSnippet = parseSnippet<Adapter>({
				trigger: /(\d)dup/,
				replacement(match, api) {
					assert.equal(this.description, "programmed");
					assert.equal(api.view?.id, 7);
					return `${(match as RegExpExecArray)[1]}+$0`;
				},
				options: "rmA",
				description: "programmed",
			})[0];
			assert.equal(matchSnippet(stringSnippet, { before: "4dup", adapter: { id: 7 } })?.replacement.insert, "4+");

			const nodeSnippet = parseSnippet({
				trigger: /(\d)node/,
				replacement: () => [new CaptureNode(0), new TextNode("="), new TabstopNode(2, "value")],
				options: "rmA",
			})[0];
			assert.deepEqual(matchSnippet(nodeSnippet, { before: "8node" })?.replacement, {
				insert: "8=value",
				tabstops: [{ index: [2], from: 2, to: 7 }],
			});

			const cancelled = parseSnippet({ trigger: "no", replacement: () => false, options: "mA" })[0];
			assert.equal(matchSnippet(cancelled, { before: "no" }), null);
		});

		test("supports node arrays, nested snippet nodes, and capture defaults", () => {
			const result = new ArrayNode([
				new TextNode("pre"),
				new SnippetNode(2, [new CaptureNode("name", "x"), new TextNode(":"), new TabstopNode(1, "value")]),
				new BaseNode(() => "!"),
			]).applyInsert({ captures: { match: [], groups: { name: "lhs" } } });
			assert.equal(result.insert, "prelhs:value!");
			assert.deepEqual(result.tabstops, [
				{ index: [2], from: 3, to: 12 },
				{ index: [2, 1], from: 7, to: 12 },
			]);
		});

		test("expands visual and original selections with a selected tabstop", () => {
			const snippet = parseSnippet({
				trigger: "b",
				replacement: "\\mathbf{${VISUAL}} % ${VISUAL_ORIGINAL}",
				options: "mv",
			})[0];
			const result = matchSnippet(snippet, {
				before: "$",
				selection: "x",
				originalSelection: " x ",
				triggerKey: "b",
			});
			assert.equal(result?.replacement.insert, "\\mathbf{x} %  x ");
			assert.deepEqual(result?.replacement.tabstops, [{ index: [0], from: 0, to: 16 }]);
			assert.deepEqual(new VisualSnippetNode("(${VISUAL})$0").applyInsert({
				captures: { match: [], groups: { "${VISUAL}": "z" } },
			}), {
				insert: "(z)",
				tabstops: [{ index: [0], from: 3, to: 3 }],
			});
		});

		test("normalizes variables and portable key names", () => {
			const variables = normalizeSnippetVariables({ GREEK: "alpha|beta", "${DIGIT}": "\\d" });
			assert.deepEqual(variables, { "${GREEK}": "alpha|beta", "${DIGIT}": "\\d" });
			assert.equal(insertSnippetVariables("(${GREEK})(${DIGIT})", variables), "(alpha|beta)(\\d)");
			assert.equal(parseKeyName("Mod-Shift-Enter", false), "Shift-Ctrl-Enter");
			assert.equal(parseKeyName("Mod-Space", true), "Meta- ");
			assert.throws(() => normalizeSnippetVariables({ BAD: 3 }), /must be a string/);
		});

		test("evaluates and parses an unchanged-style executable snippet fixture", () => {
			const snippets = parseSnippets(evaluateModuleFile("test/fixtures/representative-snippets.js"));
			assert.ok(snippets.length >= 4);
			const markdown = atMarker("$xhat|$").context;
			const latex = atMarker("\\begin{align}23sum|\\end{align}", "latex").context;
			assert.equal(matchFirstSnippet(snippets, snippetContext(markdown, "$xhat", { automatic: true }))?.replacement.insert, "\\hat{x}");
			assert.equal(matchFirstSnippet(snippets, snippetContext(latex, "\\begin{align}23sum", { automatic: true }))?.replacement.insert, "\\sum_{2}^{3} ");
			assert.equal(matchFirstSnippet(snippets, { before: "pair", automatic: false })?.replacement.insert, "(x, y)");
		});

		test("parses bundled defaults and reproduces examples", () => {
			const variableValue = evaluateModuleFile("upstream/default_snippet_variables.js");
			assert.equal(typeof variableValue, "object");
			const variables = normalizeSnippetVariables(variableValue as Record<string, unknown>);
			const api = createLatexSuiteApi({ snippetVariables: variables });
			const snippets = parseSnippets(evaluateModuleFile("upstream/default_snippets.js", api), variables);
			assert.equal(snippets.length, 199);

			const prose = atMarker("mk|").context;
			assert.deepEqual(matchFirstSnippet(snippets, snippetContext(prose, "mk", { automatic: true }))?.replacement, {
				insert: "$$",
				tabstops: [{ index: [0], from: 1, to: 1 }],
			});
			const inlineEnvironment = atMarker("$ beg|$");
			assert.equal(matchFirstSnippet(snippets, snippetContext(inlineEnvironment.context, "$ beg", { automatic: true }))?.replacement.insert, " \\begin{}  \\end{}");

			const markdownMath = atMarker("$@a|$").context;
			assert.equal(matchFirstSnippet(snippets, snippetContext(markdownMath, "$@a", { automatic: true }))?.replacement.insert, "\\alpha");
			const latexMath = atMarker("\\begin{align}3rt|\\end{align}", "latex").context;
			assert.equal(matchFirstSnippet(snippets, snippetContext(latexMath, "\\begin{align}3rt", { automatic: true }))?.replacement.insert, "\\sqrt[3]{  }");
		});

		test("serializes functions and regular expressions for useful diagnostics", () => {
			const serialized = serializeSnippetLike({ trigger: /x/, replacement: () => "y" });
			assert.match(serialized, /\[\[RegExp\]\]: \/x\//);
			assert.match(serialized, /\[\[Function\]\]/);
		});
	});

	suite("VS Code snippet conversion", () => {
		test("keeps a tabstop before a newline before its CRLF replacement", () => {
			const normalized = normalizeReplacementEol({
				insert: "a\n+b",
				tabstops: [{ index: [0], from: 1, to: 1 }],
			}, vscode.EndOfLine.CRLF);
			assert.equal(normalized.insert, "a\r\n+b");
			assert.deepEqual(normalized.tabstops, [{ index: [0], from: 1, to: 1 }]);
		});

		test("escapes literal TeX, dollars, braces, and backslashes", () => {
			assert.equal(escapeSnippetText("\\alpha $x}"), "\\\\alpha \\$x\\}");
			assert.equal(toVscodeSnippet({ insert: "\\alpha $x}", tabstops: [] }), "\\\\alpha \\$x\\}");
		});

		test("remaps upstream zero-based tabstops in numerical order", () => {
			assert.equal(toVscodeSnippet({
				insert: "\\frac{n}{d}",
				tabstops: [
					{ index: [1], from: 9, to: 10 },
					{ index: [0], from: 6, to: 7 },
					{ index: [2], from: 12, to: 12 },
				],
			}), "\\\\frac{${1:n}\\}{${2:d}\\}$0");
		});

		test("renders nested tabstop paths as nested VS Code placeholders", () => {
			assert.equal(toVscodeSnippet({
				insert: "abc",
				tabstops: [
					{ index: [2], from: 0, to: 3 },
					{ index: [2, 1], from: 1, to: 2 },
				],
			}), "${1:a${0:b}c}");
			assert.equal(toVscodeSnippet({
				insert: "x",
				tabstops: [
					{ index: [0], from: 0, to: 1 },
					{ index: [0, 1], from: 0, to: 1 },
				],
			}), "${1:${0:x}}");
		});

		test("keeps a repeated final upstream tabstop linked", () => {
			assert.equal(toVscodeSnippet({
				insert: "xyy",
				tabstops: [
					{ index: [0], from: 0, to: 1 },
					{ index: [1], from: 1, to: 2 },
					{ index: [1], from: 2, to: 3 },
				],
			}), "${1:x}${2:y}$2");
		});

		test("preserves unequal repeated defaults without materializing a wrong mirror", () => {
			assert.equal(toVscodeSnippet({
				insert: "xy",
				tabstops: [
					{ index: [0], from: 0, to: 1 },
					{ index: [1], from: 1, to: 2 },
					{ index: [1], from: 2, to: 2 },
				],
			}), "${1:x}${0:y}");
		});
	});

	suite("typing features", () => {
		test("builds auto-fractions from the preceding atom", () => {
			const marked = atMarker("$x + ab|/$");
			const plan = planAutoFraction(marked.source, marked.offset, marked.context, fractionOptions, undefined, marked.offset + 1);
			assert.deepEqual(plan, {
				start: 5,
				end: 8,
				replacement: {
					insert: "\\frac{ab}{}",
					tabstops: [
						{ index: [1], from: 10, to: 10 },
						{ index: [2], from: 11, to: 11 },
					],
				},
			});
		});

		test("keeps balanced groups and removes redundant outer parentheses", () => {
			const grouped = atMarker("$a + f(x + 1)|/$");
			assert.equal(planAutoFraction(grouped.source, grouped.offset, grouped.context, fractionOptions, undefined, grouped.offset + 1)?.replacement.insert, "\\frac{f(x + 1)}{}");
			const parenthesized = atMarker("$(x+1)|/$");
			assert.equal(planAutoFraction(parenthesized.source, parenthesized.offset, parenthesized.context, fractionOptions, undefined, parenthesized.offset + 1)?.replacement.insert, "\\frac{x+1}{}");
		});

		test("supports selected numerators and custom fraction commands", () => {
			const marked = atMarker("$alpha|/$");
			const plan = planAutoFraction(
				marked.source,
				marked.offset,
				marked.context,
				{ ...fractionOptions, symbol: "\\tfrac" },
				{ start: 1, end: 6, text: "alpha" },
				marked.offset + 1,
			);
			assert.equal(plan?.replacement.insert, "\\tfrac{alpha}{}");
			assert.equal(plan?.start, 1);
		});

		test("does not fraction outside math or in excluded regions", () => {
			const prose = atMarker("alpha|/");
			assert.equal(planAutoFraction(prose.source, prose.offset, prose.context, fractionOptions, undefined, prose.offset + 1), null);
			const exponent = atMarker("$x^{ab|}/$");
			assert.equal(planAutoFraction(exponent.source, exponent.offset, exponent.context, fractionOptions, undefined, exponent.offset + 1), null);
		});

		test("detects matrix scopes and plans cell/newline/exit actions", () => {
			const single = atMarker("$\\begin{pmatrix}a|\\end{pmatrix}$");
			const scope = getMatrixScope(single.context, matrixOptions);
			assert.equal(scope?.kind, "environment");
			assert.deepEqual(planMatrixCell(single.offset), { start: single.offset, end: single.offset, text: " & " });
			assert.equal(planMatrixNewline(single.source, single.offset, scope!).replacement.insert, " \\\\  ");
			assert.equal(matrixExitTarget(single.source, single.offset, scope!), scope?.outer_end);
		});

		test("plans multiline matrix rows and exits at the end tag", () => {
			const marked = atMarker("$$\n  \\begin{matrix}\n    a & b|\n  \\end{matrix}\n$$");
			const scope = getMatrixScope(marked.context, matrixOptions);
			assert.ok(scope);
			assert.equal(planMatrixNewline(marked.source, marked.offset, scope!).replacement.insert, " \\\\" + "\n");
			assert.equal(matrixExitTarget(marked.source, marked.offset, scope!), marked.source.indexOf("\\end{matrix}") + "\\end{matrix}".length);
		});

		test("tabs out through configured closers but skips a left delimiter", () => {
			const marked = atMarker("$f(x|) + y$");
			const closers = new Set([")", "]", "\\rangle"]);
			assert.equal(findTabOutTarget(marked.source, marked.offset, marked.context.innerMathBounds!, closers), marked.source.indexOf(")") + 1);
			const sized = atMarker("$\\left(|x\\right) + z$");
			assert.equal(findTabOutTarget(sized.source, sized.offset, sized.context.innerMathBounds!, closers), sized.source.indexOf("\\right)") + "\\right)".length);
		});

		test("finds only unenclosed closing symbols for matrix Tab", () => {
			const marked = atMarker("$f|(x) ]$");
			const closers = new Set([")", "]"]);
			assert.equal(findUnenclosedClosingTarget(marked.source, marked.offset, marked.context.innerMathBounds!, closers), marked.source.indexOf("]") + 1);
		});

		test("plans bracket enlargement edits for large operators", () => {
			const marked = atMarker("$(\\frac{a}{b})|$");
			const bounds = getInnerMathBoundsAt(marked.source, marked.offset)!;
			const edits = planBracketEnlargements(marked.source, bounds, ["\\frac"], true);
			assert.equal(applyEdits(marked.source, edits), "$\\left( \\frac{a}{b} \\right)$");
		});

		test("does not double-enlarge brackets or enlarge without a trigger", () => {
			for (const sourceWithMarker of ["$\\left(\\frac{a}{b}\\right)|$", "$(a+b)|$"]) {
				const marked = atMarker(sourceWithMarker);
				assert.deepEqual(planBracketEnlargements(marked.source, marked.context.innerMathBounds!, ["\\frac"], false), []);
			}
		});

		test("does not interpret comparisons as angle delimiters", () => {
			const marked = atMarker("$x < \\frac{a}{b} > y|$");
			assert.deepEqual(planBracketEnlargements(marked.source, marked.context.innerMathBounds!, ["\\frac"], false), []);
		});

		test("does not pair delimiters across a raw TeX group boundary", () => {
			const marked = atMarker("$({ \\frac{a}{b}) }|$");
			assert.deepEqual(planBracketEnlargements(marked.source, marked.context.innerMathBounds!, ["\\frac"], false), []);
		});
	});
});
