import * as assert from "node:assert/strict";
import * as vscode from "vscode";

suite("context after direct cursor entry", () => {
	const settings = { "snippets.source": '[{ trigger: "probe", replacement: "MATCH", options: "m" }, { trigger: "zzq", replacement: "AUTO", options: "mA" }, { trigger: "mk", replacement: "$$0$", options: "tA" }]', "snippets.files": [], "snippets.variableFiles": [], "snippets.variablesSource": "", enabled: true };
	const previous = new Map<string, unknown>();

	suiteSetup(async () => {
		const configuration = vscode.workspace.getConfiguration("latexSuite");
		for (const [key, value] of Object.entries(settings)) {
			previous.set(key, configuration.inspect(key)?.globalValue);
			await configuration.update(key, value, vscode.ConfigurationTarget.Global);
		}
		await vscode.extensions.getExtension("latex-suite-port.latex-suite")!.activate();
	});

	teardown(async () => {
		await vscode.commands.executeCommand("workbench.action.closeAllEditors");
	});

	suiteTeardown(async () => {
		for (const [key, value] of previous) {
			await vscode.workspace.getConfiguration("latexSuite").update(key, value, vscode.ConfigurationTarget.Global);
		}
	});

	for (const [label, language, source] of [
		["Markdown inline math", "markdown", "Prose $probe$ end"],
		["Markdown display math", "markdown", "Prose\n$$\nprobe\n$$\nend"],
		["LaTeX equation environment", "latex", "Prose\n\\begin{equation}\nprobe\n\\end{equation}"],
		["nested delimiters and macros", "latex", "Prose \\(\\sqrt{[(probe)]}\\) end"],
	] as const) {
		test(`matches immediately after direct entry and prose re-entry: ${label}`, async () => {
			const editor = await open(language, source);
			move(editor, source.indexOf("probe") + 5);
			move(editor, 0);
			assert.equal(await vscode.commands.executeCommand("latexSuite.expandSnippet"), false);
			move(editor, source.indexOf("probe") + 5);
			assert.equal(await vscode.commands.executeCommand("latexSuite.expandSnippet"), true);
			assert.equal(editor.document.getText(), source.replace("probe", "MATCH"));
		});
	}

	test("automatic matching works when typing after direct entry into existing math", async () => {
		const editor = await open("markdown", "Prose $x+$ end");
		move(editor, 9);
		for (const character of "zzq") {
			await vscode.commands.executeCommand("type", { text: character });
			await new Promise(resolve => setImmediate(resolve));
			await vscode.commands.executeCommand("latexSuite.internal.waitForIdle");
		}
		await waitFor(() => editor.document.getText() === "Prose $x+AUTO$ end");
	});

	test("writes equations and later prose, then edits ordinary and nested math in the earlier equation", async () => {
		const editor = await writeNote("\\sqrt{(x)}+y");
		const suffix = ". Later $z+1$. End.";
		move(editor, editor.document.getText().indexOf("+y") + 2);
		const reentered = editor.selection;
		await vscode.commands.executeCommand("jumpToNextSnippetPlaceholder");
		assert.ok(editor.selection.isEqual(reentered), "The original snippet session has ended");
		await typeText("zzq");
		assert.equal(editor.document.getText(), "Earlier: $\\sqrt{(x)}+yAUTO$" + suffix);
		await vscode.commands.executeCommand("leaveSnippet");

		// Return to a different interior point, inside both a macro and parentheses.
		move(editor, editor.document.getText().indexOf("(x)") + 2);
		await typeText("/");
		await typeText("2");
		await vscode.commands.executeCommand("leaveSnippet");
		const expected = "Earlier: $\\sqrt{\\left( \\frac{x}{2} \\right)}+yAUTO$" + suffix;
		assert.equal(editor.document.getText(), expected);
		assert.equal(offset(editor), expected.indexOf("{2}") + 2);
		await vscode.commands.executeCommand("latexSuite.tab");
		assert.equal(offset(editor), expected.indexOf("{2}") + 3);
		await vscode.commands.executeCommand("latexSuite.tab");
		assert.equal(offset(editor), expected.indexOf("\\right)") + "\\right)".length);
		assert.equal(editor.document.getText(), expected, "Later equation and prose stay intact");
	});

	test("writes a matrix and later content, then returns to edit and add a cell", async () => {
		const editor = await writeNote("\\begin{pmatrix}(x)\\end{pmatrix}");
		move(editor, editor.document.getText().indexOf("(x)") + 2);
		const before = editor.selection;
		await vscode.commands.executeCommand("jumpToNextSnippetPlaceholder");
		assert.ok(editor.selection.isEqual(before));
		await typeText("zzq");
		await vscode.commands.executeCommand("leaveSnippet");
		await vscode.commands.executeCommand("latexSuite.tab");
		assert.equal(offset(editor), editor.document.getText().indexOf("(xAUTO)") + "(xAUTO)".length);
		await vscode.commands.executeCommand("latexSuite.tab");
		await typeText("y");
		const expected = "Earlier: $\\begin{pmatrix}(xAUTO) & y\\end{pmatrix}$. Later $z+1$. End.";
		assert.equal(editor.document.getText(), expected);
		assert.equal(offset(editor), expected.indexOf("y\\end") + 1);
	});

	test("re-entry respects text macros inside math", async () => {
		const source = "Prose $\\text{probe}+\\sqrt{probe}$";
		const editor = await open("markdown", source);
		move(editor, source.indexOf("probe") + 5);
		assert.equal(await vscode.commands.executeCommand("latexSuite.expandSnippet"), false);
		move(editor, source.lastIndexOf("probe") + 5);
		assert.equal(await vscode.commands.executeCommand("latexSuite.expandSnippet"), true);
		assert.equal(editor.document.getText(), "Prose $\\text{probe}+\\sqrt{MATCH}$");
	});

	test("direct entry and consecutive contextual Tabs traverse identical nested closers", async () => {
		const source = "Prose $[\\sqrt{(x)}]$ end";
		const continuous = await open("markdown", source);
		move(continuous, source.indexOf("x") + 1);
		const stops = [offset(continuous)];
		for (let i = 0; i < 4; i++) {
			await vscode.commands.executeCommand("latexSuite.tab");
			stops.push(offset(continuous));
			assert.equal(continuous.document.getText(), source);
		}
		assert.equal(stops.at(-1), source.lastIndexOf("$") + 1);
		for (let i = 0; i < stops.length - 1; i++) {
			const direct = await open("markdown", source);
			move(direct, 0);
			move(direct, stops[i]);
			await vscode.commands.executeCommand("latexSuite.tab");
			assert.equal(offset(direct), stops[i + 1]);
			assert.equal(direct.document.getText(), source);
		}
	});

	test("fraction after a Tab stop is identical after direct entry", async () => {
		const source = "Prose $((x))$ end";
		const continuous = await open("markdown", source);
		move(continuous, source.indexOf("x") + 1);
		await vscode.commands.executeCommand("latexSuite.tab");
		const target = offset(continuous);
		assert.equal(await vscode.commands.executeCommand("latexSuite.autoFraction"), true);
		const expected = continuous.document.getText();
		const expectedSelection = continuous.selection;
		assert.match(expected, /\\frac/);
		await vscode.commands.executeCommand("leaveSnippet");
		const direct = await open("markdown", source);
		move(direct, target);
		assert.equal(await vscode.commands.executeCommand("latexSuite.autoFraction"), true);
		assert.equal(direct.document.getText(), expected);
		assert.ok(direct.selection.isEqual(expectedSelection));
	});

	test("matrix key context refreshes on movement and document switches; commands work immediately", async () => {
		const original = vscode.commands.executeCommand;
		let matrix: unknown;
		vscode.commands.executeCommand = (async (command: string, ...args: unknown[]) => {
			if (command === "setContext" && args[0] === "latexSuite.inMatrix") {
				matrix = args[1];
			}
			return original(command, ...args);
		}) as typeof original;
		try {
			const source = "Prose $\\begin{pmatrix}(x)\\end{pmatrix}$ end";
			const editor = await open("markdown", source);
			await waitFor(() => matrix === false);
			move(editor, source.indexOf("(x)") + 2);
			await waitFor(() => matrix === true);
			await vscode.commands.executeCommand("latexSuite.tab");
			const target = offset(editor);
			assert.equal(target, source.indexOf("(x)") + 3);
			await vscode.commands.executeCommand("latexSuite.tab");
			const expected = editor.document.getText();
			assert.equal(expected, source.replace("(x)", "(x) & "));
			const direct = await open("markdown", source);
			await waitFor(() => matrix === false);
			move(direct, target);
			// Do not wait for the asynchronous key-context refresh.
			assert.equal(await vscode.commands.executeCommand("latexSuite.matrixCell"), true);
			assert.equal(direct.document.getText(), expected);
			await waitFor(() => matrix === true);
			move(direct, 0);
			await waitFor(() => matrix === false);
			move(direct, target);
			await waitFor(() => matrix === true);
			await open("markdown", "ordinary prose");
			await waitFor(() => matrix === false);
			await vscode.window.showTextDocument(direct.document);
			await waitFor(() => matrix === true);
		} finally {
			vscode.commands.executeCommand = original;
		}
	});

	test("document edits invalidate math context at the same cursor offset", async () => {
		const editor = await open("markdown", "$probe$");
		move(editor, 6);
		assert.equal(await vscode.commands.executeCommand("latexSuite.nextBracketOrEquation"), true);
		await editor.edit(builder => builder.replace(new vscode.Range(0, 0, 0, 7), " probe "));
		move(editor, 6);
		assert.equal(await vscode.commands.executeCommand("latexSuite.expandSnippet"), false);
		assert.equal(await vscode.commands.executeCommand("latexSuite.nextBracketOrEquation"), false);
		assert.equal(editor.document.getText(), " probe ");
	});

	test("entering existing text does not resurrect native snippet placeholders", async () => {
		const source = "$\\frac{x}{y}$";
		const editor = await open("markdown", source);
		move(editor, source.indexOf("x"));
		const before = editor.selection;
		await vscode.commands.executeCommand("jumpToNextSnippetPlaceholder");
		assert.ok(editor.selection.isEqual(before));
		move(editor, source.indexOf("x") + 1);
		await vscode.commands.executeCommand("latexSuite.tab");
		assert.equal(offset(editor), source.indexOf("}") + 1);
		assert.equal(editor.document.getText(), source);
	});
});

async function open(language: "markdown" | "latex", content: string): Promise<vscode.TextEditor> {
	const document = await vscode.workspace.openTextDocument({ language, content });
	const editor = await vscode.window.showTextDocument(document);
	move(editor, 0);
	return editor;
}

function move(editor: vscode.TextEditor, position: number): void {
	const point = editor.document.positionAt(position);
	editor.selection = new vscode.Selection(point, point);
}

function offset(editor: vscode.TextEditor): number {
	return editor.document.offsetAt(editor.selection.active);
}

async function waitFor(predicate: () => boolean): Promise<void> {
	const deadline = Date.now() + 3000;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, "Context key did not refresh");
		await new Promise(resolve => setTimeout(resolve, 10));
	}
}

async function typeText(text: string): Promise<void> {
	for (const character of text) {
		await vscode.commands.executeCommand("type", { text: character });
		await new Promise(resolve => setImmediate(resolve));
		await vscode.commands.executeCommand("latexSuite.internal.waitForIdle");
	}
}

async function writeNote(earlierEquation: string): Promise<vscode.TextEditor> {
	const editor = await open("markdown", "");
	await typeText("Earlier: mk");
	assert.equal(editor.document.getText(), "Earlier: $$");
	await typeText(earlierEquation);
	await vscode.commands.executeCommand("leaveSnippet");
	await vscode.commands.executeCommand("latexSuite.tab");
	assert.equal(offset(editor), editor.document.getText().length);
	await typeText(". Later mk");
	await typeText("z+1");
	await vscode.commands.executeCommand("leaveSnippet");
	await vscode.commands.executeCommand("latexSuite.tab");
	await typeText(". End.");
	assert.equal(editor.document.getText(), `Earlier: $${earlierEquation}$. Later $z+1$. End.`);
	assert.equal(offset(editor), editor.document.getText().length);
	return editor;
}
