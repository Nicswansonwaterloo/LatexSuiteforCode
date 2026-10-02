import * as assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";
import { personalNote } from "./fixtures/personal-note";

suite("Personal configuration long-form typing (development only)", function () {
	this.timeout(180_000);

	test("writes a complete math note using personal shortcuts in one editor", async () => {
		const configuration = vscode.workspace.getConfiguration("latexSuite");
		const fixtures = path.resolve(__dirname, "../../src/test/fixtures");
		const settings: Record<string, unknown> = {
			enabled: true,
			"snippets.enabled": true,
			"snippets.source": "",
			"snippets.variablesSource": "",
			"snippets.files": [path.join(fixtures, "personal-snippets.js")],
			"snippets.variableFiles": [path.join(fixtures, "personal-variables.js")],
		};
		const previous = new Map(Object.keys(settings).map(key => [key, configuration.inspect(key)?.globalValue]));
		const categories = new Set<string>();
		let expected = "";
		const document = await vscode.workspace.openTextDocument({ language: "markdown", content: "" });
		const editor = await vscode.window.showTextDocument(document);
		try {
			for (const [key, value] of Object.entries(settings)) {
				await configuration.update(key, value, vscode.ConfigurationTarget.Global);
			}
			await vscode.extensions.getExtension("latex-suite-port.latex-suite")!.activate();
			await vscode.commands.executeCommand("latexSuite.reloadSnippets");
			for (const part of personalNote) {
				if ("prose" in part) {
					await type(part.prose);
					expected += part.expected ?? part.prose;
				} else {
					part.categories.forEach(category => categories.add(category));
					await type(part.inline ? "mk" : "dk");
					for (const action of part.actions) {
						if (typeof action === "string") {
							await type(action);
						} else if (action.command === "placeholder") {
							await vscode.commands.executeCommand("jumpToNextSnippetPlaceholder");
						} else if (action.command === "contextualTab") {
							await vscode.commands.executeCommand("latexSuite.tab");
					} else if (action.command === "manual") {
							assert.equal(await vscode.commands.executeCommand("latexSuite.expandSnippet"), true, part.label);
						} else {
							const commands = { undo: "undo", backspace: "deleteLeft", cell: "latexSuite.matrixCell", row: "latexSuite.matrixNewline", exitMatrix: "latexSuite.matrixExit", selectLeft: "cursorLeftSelect", selectionEnd: "cursorRight" };
							await vscode.commands.executeCommand(commands[action.command]);
							await vscode.commands.executeCommand("latexSuite.internal.waitForIdle");
						}
					}
					const delimiter = part.inline ? "$" : "$$";
					expected += delimiter + part.expected + delimiter;
					assert.equal(normalize(document.getText()), expected, `Equation: ${part.label}`);
					await vscode.commands.executeCommand("leaveSnippet");
					for (let step = 0; document.offsetAt(editor.selection.active) < document.getText().length && step < 10; step++) {
						const before = document.offsetAt(editor.selection.active);
						assert.equal(await vscode.commands.executeCommand("latexSuite.nextBracketOrEquation"), true, `Tab-out after ${part.label}`);
						assert.ok(document.offsetAt(editor.selection.active) > before, `Tab-out must advance after ${part.label}`);
					}
					assert.equal(document.offsetAt(editor.selection.active), document.getText().length, `Caret after ${part.label}`);
					if (!part.inline) {
						// Exiting a multiline equation inserts its following line at EOF.
						const multiline = part.expected.includes("\n");
						if (multiline) { expected += "\n"; }
						assert.equal(normalize(document.getText()), expected, `After tab-out: ${part.label}`);
						await type(multiline ? "\n" : "\n\n");
						expected += multiline ? "\n" : "\n\n";
					}
				}
				assert.equal(normalize(document.getText()), expected, "Cumulative note must remain intact");
			}
			for (const category of ["Math mode", "Greek letters", "Text environment", "Basic operations", "Accents", "Sum Cool Shortcuts", "Handle spaces and backslashes", "Derivatives and integrals", "Trigonometry", "Quantum mechanics", "Environments", "Brackets"]) {
				assert.ok(categories.has(category), `Missing category: ${category}`);
			}
			// Save the actual typed document, never a prefilled editor or generated golden.
			await vscode.workspace.fs.writeFile(vscode.Uri.file(path.resolve(__dirname, "personal-note.actual.md")), new TextEncoder().encode(normalize(document.getText())));
		} finally {
			for (const [key, value] of previous) {
				await configuration.update(key, value, vscode.ConfigurationTarget.Global);
			}
			await vscode.commands.executeCommand("latexSuite.reloadSnippets");
			await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
		}
	});
});

async function type(value: string): Promise<void> {
	for (const character of value) {
		await vscode.commands.executeCommand("type", { text: character });
		// Let the editor's change notification reach the extension before draining it.
		await new Promise<void>(resolve => character === "\n" ? setTimeout(resolve, 5) : setImmediate(resolve));
		await vscode.commands.executeCommand("latexSuite.internal.waitForIdle");
	}
}

function normalize(value: string): string {
	return value.replaceAll("\r\n", "\n");
}
