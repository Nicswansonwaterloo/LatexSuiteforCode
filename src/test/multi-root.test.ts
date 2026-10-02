import * as assert from "node:assert/strict";
import * as vscode from "vscode";

suite("multi-root snippet loading", () => {
	test("the same relative source resolves independently in each document's folder", async () => {
		const folders = vscode.workspace.workspaceFolders;
		assert.equal(folders?.length, 2);
		const keys = ["snippets.files", "snippets.source", "snippets.variableFiles", "snippets.variablesSource"];
		const saved: Array<{ config: vscode.WorkspaceConfiguration; key: string; value: unknown }> = [];
		const files: vscode.Uri[] = [];
		try {
			for (const [index, folder] of folders!.entries()) {
				const config = vscode.workspace.getConfiguration("latexSuite", folder.uri);
				for (const key of keys) {
					saved.push({ config, key, value: config.inspect(key)?.workspaceFolderValue });
					await config.update(key, key === "snippets.files" ? ["shared.js"] : key.endsWith("Files") ? [] : "", vscode.ConfigurationTarget.WorkspaceFolder);
				}
				const source = vscode.Uri.joinPath(folder.uri, "shared.js");
				const note = vscode.Uri.joinPath(folder.uri, "note.md");
				files.push(source, note);
				await vscode.workspace.fs.writeFile(source, new TextEncoder().encode(`[{ trigger: "probe", replacement: "FOLDER${index}", options: "m" }]`));
				await vscode.workspace.fs.writeFile(note, new TextEncoder().encode("$probe$"));
			}
			await vscode.extensions.getExtension("latex-suite-port.latex-suite")!.activate();
			for (const index of [0, 1, 0]) {
				const document: vscode.TextDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folders![index].uri, "note.md"));
				const editor = await vscode.window.showTextDocument(document);
				editor.selection = new vscode.Selection(0, 6, 0, 6);
				assert.equal(await vscode.commands.executeCommand("latexSuite.expandSnippet"), true);
				assert.equal(document.getText(), `$FOLDER${index}$`);
				await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
			}
		} finally {
			for (const { config, key, value } of saved) { await config.update(key, value, vscode.ConfigurationTarget.WorkspaceFolder); }
			for (const uri of files) { await vscode.workspace.fs.delete(uri); }
		}
	});
});
