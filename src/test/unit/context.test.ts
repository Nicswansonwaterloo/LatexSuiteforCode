import * as assert from "node:assert/strict";
import { parseContext, matchesSnippetContext } from "../../core/context";

suite("parsed document context", () => {
	test("macro scopes distinguish actual text/color arguments from adjacent math groups", () => {
		for (const [source, text, snippetless] of [
			["$\\text{hello}{x}$", false, false],
			["$\\color{red}{x}$", false, false],
			["$\\colorbox{red}{x}$", true, false],
			["$\\fcolorbox{red}{white}{x}$", true, false],
			["$\\operatorname{x}$", false, true],
			["$\\style{x}{y}$", false, true],
		] as const) {
			const mode = parseContext(source).at(source.indexOf("{x}") + 2).mode;
			assert.equal(mode.textEnv, text, source);
			assert.equal(mode.snippetlessEnv, snippetless, source);
		}
		const first = parseContext("$\\pu{x}{y}$").at(6);
		const second = parseContext("$\\pu{x}{y}$").at(9);
		assert.equal(matchesSnippetContext(first, { options: "m", excludedMacros: ["pu"] }), false);
		assert.equal(matchesSnippetContext(second, { options: "m", excludedMacros: ["pu"] }), true);
		assert.equal(matchesSnippetContext(second, { options: "m", excludedMacros: [{ name: "pu" }] }), false);
	});

	test("queries prose, math, code, comments, and nested macros in one parsed document", () => {
		const source = "Prose $x + \\text{words $y$}$ `code`\n```math\nz % comment\n```";
		const parsed = parseContext(source);
		assert.equal(parsed.at(2).kind, "text");
		assert.equal(parsed.at(source.indexOf("x") + 1).mode.inlineMath, true);
		assert.equal(parsed.at(source.indexOf("words") + 2).mode.textEnv, true);
		assert.equal(parsed.at(source.indexOf("y") + 1).mode.textEnv, false);
		assert.equal(parsed.at(source.indexOf("code") + 2).kind, "inlineCode");
		assert.equal(parsed.at(source.indexOf("z") + 1).kind, "codeMath");
		assert.equal(parsed.at(source.indexOf("comment") + 2).kind, "latexComment");
		assert.equal(parsed.at(2).kind, "text");
	});

	test("new document revisions and fence settings produce independent parse results", () => {
		const previous = parseContext("$x$");
		const changed = parseContext(" x ");
		assert.equal(previous.at(2).kind, "inlineMath");
		assert.equal(changed.at(2).kind, "text");
		const source = "```custom\nx\n```";
		assert.equal(parseContext(source).at(11).kind, "codeBlock");
		assert.equal(parseContext(source, { mathFenceLanguages: ["custom"] }).at(11).kind, "codeMath");
	});
});
