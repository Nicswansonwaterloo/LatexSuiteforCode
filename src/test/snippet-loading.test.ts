import * as assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { getConfig, type LatexSuiteConfig } from "../config";
import { SnippetRepository } from "../snippetRepository";
import { matchFirstSnippet } from "../core/snippets";

suite("snippet collection selection", () => {
	let repository: SnippetRepository;
	let output: vscode.OutputChannel;
	let document: vscode.TextDocument;
	let config: LatexSuiteConfig;
	let directory: string;
	const custom = '[{ trigger: "customOnly", replacement: "CUSTOM", options: "tA" }]';

	suiteSetup(() => { output = vscode.window.createOutputChannel("Snippet collection tests"); });
	suiteTeardown(() => output.dispose());

	setup(async () => {
		repository = new SnippetRepository(output);
		document = await vscode.workspace.openTextDocument({ language: "markdown" });
		config = getConfig(document);
		Object.assign(config.snippets, { source: "", files: [], variablesSource: "", variableFiles: [] });
		directory = await mkdtemp(path.join(tmpdir(), "latex-suite-collection-"));
	});

	teardown(async () => {
		repository.dispose();
		await rm(directory, { recursive: true, force: true });
	});

	async function file(name: string, source: string): Promise<string> {
		const uri = vscode.Uri.file(path.join(directory, name));
		await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(source));
		return uri.fsPath;
	}

	test("uses bundled snippets with no sources or only blank entries", async () => {
		const defaults = await repository.get(document, config);
		assert.ok(defaults.snippets.length > 100);
		assert.deepEqual(defaults.errors, []);
		config.snippets.source = " \n ";
		config.snippets.files = ["", " \t "];
		const blank = await repository.get(document, config);
		assert.deepEqual(blank.snippets.map(s => s.trigger), defaults.snippets.map(s => s.trigger));
	});

	test("custom inline snippets replace bundled snippets", async () => {
		config.snippets.source = custom;
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets.map(s => s.trigger), ["customOnly"]);
		assert.deepEqual(bundle.errors, []);
	});

	test("custom files and inline source form one collection without defaults", async () => {
		config.snippets.source = custom;
		config.snippets.files = [await file("custom.js", '[{ trigger: "fileOnly", replacement: "FILE", options: "tA" }]')];
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets.map(s => s.trigger).sort(), ["customOnly", "fileOnly"]);
		assert.deepEqual(bundle.errors, []);
	});

	test("an explicit empty inline collection does not restore defaults", async () => {
		config.snippets.source = "[]";
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets, []);
		assert.deepEqual(bundle.errors, []);
	});

	test("an empty custom file does not restore defaults", async () => {
		config.snippets.files = [await file("empty.js", "")];
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets, []);
	});

	test("an empty custom directory does not restore defaults", async () => {
		config.snippets.files = [directory];
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets, []);
		assert.deepEqual(bundle.errors, []);
	});

	test("a missing custom file reports an error without restoring defaults", async () => {
		config.snippets.files = [path.join(directory, "missing.js")];
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets, []);
		assert.equal(bundle.errors.length, 1);
		assert.match(bundle.errors[0], /missing\.js/);
	});

	test("invalid custom JavaScript reports an error without restoring defaults", async () => {
		config.snippets.source = "export default [";
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets, []);
		assert.equal(bundle.errors.length, 1);
		assert.match(bundle.errors[0], /inline snippets/);
	});

	test("a failing file preserves valid custom sources without adding defaults", async () => {
		config.snippets.source = custom;
		config.snippets.files = [await file("broken.js", 'throw new Error("broken source");')];
		const bundle = await repository.get(document, config);
		assert.deepEqual(bundle.snippets.map(s => s.trigger), ["customOnly"]);
		assert.equal(bundle.errors.length, 1);
		assert.match(bundle.errors[0], /broken source/);
	});

	test("variable overrides retain bundled variables and do not select custom snippets", async () => {
		config.snippets.variablesSource = '({ GREEK: "inlineOverride", EXTRA: "extra" })';
		config.snippets.variableFiles = [await file("variables.js", '({ GREEK: "fileOverride" })')];
		const defaults = await repository.get(document, config);
		assert.ok(defaults.snippets.length > 100);
		assert.equal(defaults.variables["${GREEK}"], "fileOverride");
		assert.equal(defaults.variables["${EXTRA}"], "extra");
		assert.ok(defaults.variables["${SYMBOL}"]);
		config.snippets.source = custom;
		const customBundle = await repository.get(document, config);
		assert.deepEqual(customBundle.snippets.map(s => s.trigger), ["customOnly"]);
		assert.deepEqual(customBundle.variables, defaults.variables);
	});

	for (const location of ["inline", "file"]) {
		for (const ending of ["", ";"]) {
			test(`loads quoted variable keys from ${location} source ending in ${JSON.stringify(ending)}`, async () => {
				const source = `{
					// Upstream variable files use quoted placeholder names.
					"\${GREEK}": "alpha|beta",
					"\${OPERATORNAMES}": "End|Hom|Aut|Mat|wt|GL|char|Pic|disc|trd"
				}${ending}`;
				if (location === "file") {
					config.snippets.variableFiles = [await file("variables.js", source)];
				} else {
					config.snippets.variablesSource = source;
				}
				config.snippets.source = `[{
					trigger: "(\${OPERATORNAMES})",
					replacement: "\\\\operatorname{[[0]]}",
					options: "rmA"
				}]`;
				const bundle = await repository.get(document, config);
				assert.deepEqual(bundle.errors, []);
				for (const name of bundle.variables["${OPERATORNAMES}"].split("|")) {
					const match = matchFirstSnippet(bundle.snippets, {
						before: `$${name}`, automatic: true,
						mode: {
							inlineMath: true, blockMath: false, codeMath: false,
							text: false, codeBlock: false, code: false,
							textEnv: false, snippetlessEnv: false,
						},
					});
					assert.equal(match?.replacement.insert, `\\operatorname{${name}}`);
				}
			});
		}
	}

	test("simulated trust gate: Restricted Mode uses defaults without evaluating or reading custom sources", async () => {
		const descriptor = Object.getOwnPropertyDescriptor(vscode.workspace, "isTrusted")!;
		try {
			Object.defineProperty(vscode.workspace, "isTrusted", { configurable: true, get: () => false });
			config.snippets.source = 'throw new Error("must not execute")';
			config.snippets.variablesSource = config.snippets.source;
			config.snippets.files = [path.join(directory, "missing.js")];
			config.snippets.variableFiles = config.snippets.files;
			const bundle = await repository.get(document, config);
			assert.ok(bundle.snippets.length > 100);
			assert.deepEqual(bundle.errors, []);
			assert.equal(bundle.customSourcesSkipped, true);
			// A changed trust state must not reuse the Restricted Mode bundle.
			Object.defineProperty(vscode.workspace, "isTrusted", { configurable: true, get: () => true });
			const trusted = await repository.get(document, config);
			assert.deepEqual(trusted.snippets, []);
			assert.equal(trusted.errors.length, 4);
			assert.equal(trusted.customSourcesSkipped, false);
		} finally {
			Object.defineProperty(vscode.workspace, "isTrusted", descriptor);
		}
	});

	for (const legacyMode of ["extend", "replace", "defaultsOnly"]) {
		test(`ignores legacy ${legacyMode} values`, async () => {
			assert.equal("mode" in config.snippets, false);
			Object.assign(config.snippets, { mode: legacyMode });
			assert.ok((await repository.get(document, config)).snippets.length > 100);
			config.snippets.source = custom;
			assert.deepEqual((await repository.get(document, config)).snippets.map(s => s.trigger), ["customOnly"]);
		});
	}
});
