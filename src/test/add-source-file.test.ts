import * as assert from "node:assert/strict";
import * as vscode from "vscode";

suite("Add source file commands", () => {
	for (const [command, setting] of [
		["latexSuite.addSnippetFile", "snippets.files"],
		["latexSuite.addVariableFile", "snippets.variableFiles"],
	] as const) {
		suite(command, () => {
			let configuration: vscode.WorkspaceConfiguration;
			let previousGlobal: string[] | undefined;
			let previousWorkspace: string[] | undefined;
			let previousFolder: string[] | undefined;
			const folderFiles = ["folder-only.js"];
			let selected: vscode.Uri[] | undefined;
			let localFile: vscode.Uri;
			let messages: string[];
			let dialogOptions: vscode.OpenDialogOptions | undefined;
			const originalDialog = vscode.window.showOpenDialog;
			const originalMessage = vscode.window.showInformationMessage;

			setup(async () => {
				const folder = vscode.workspace.workspaceFolders?.[0];
				assert.ok(folder, "Run with the isolated workspace in .vscode-test.mjs");
				configuration = vscode.workspace.getConfiguration("latexSuite", folder.uri);
				const values = configuration.inspect<string[]>(setting);
				previousGlobal = values?.globalValue;
				previousWorkspace = values?.workspaceValue;
				previousFolder = values?.workspaceFolderValue;
				localFile = vscode.Uri.joinPath(folder.uri, "chosen file #1.js");
				selected = [localFile];
				messages = [];
				dialogOptions = undefined;
				await vscode.extensions.getExtension("latex-suite-port.latex-suite")!.activate();
				vscode.window.showOpenDialog = async options => {
					dialogOptions = options;
					return selected;
				};
				vscode.window.showInformationMessage = (async (message: string) => {
					messages.push(message);
					return undefined;
				}) as typeof vscode.window.showInformationMessage;
			});

			teardown(async () => {
				vscode.window.showOpenDialog = originalDialog;
				vscode.window.showInformationMessage = originalMessage;
				await configuration.update(setting, previousGlobal, vscode.ConfigurationTarget.Global);
				await configuration.update(setting, previousWorkspace, vscode.ConfigurationTarget.Workspace);
				await configuration.update(setting, previousFolder, vscode.ConfigurationTarget.WorkspaceFolder);
			});

			async function configure(global: string[] | undefined, workspace: string[] | undefined): Promise<void> {
				await configuration.update(setting, global, vscode.ConfigurationTarget.Global);
				await configuration.update(setting, workspace, vscode.ConfigurationTarget.Workspace);
				await configuration.update(setting, folderFiles, vscode.ConfigurationTarget.WorkspaceFolder);
			}

			function assertValues(global: string[] | undefined, workspace: string[] | undefined): void {
				const values = configuration.inspect<string[]>(setting);
				assert.deepEqual(values?.globalValue, global);
				assert.deepEqual(values?.workspaceValue, workspace);
				assert.deepEqual(values?.workspaceFolderValue, folderFiles);
			}

			test("adds one local path only to User settings and preserves workspace overrides", async () => {
				const existing = ["/existing/user.js", "relative-user.js"];
				const workspace = ["relative-workspace.js"];
				await configure(existing, workspace);
				await vscode.commands.executeCommand(command);
				assertValues([...existing, localFile.fsPath], workspace);
				assert.equal(dialogOptions?.canSelectMany, false);
				assert.equal(dialogOptions?.canSelectFolders, false);
				assert.match(messages[0], /User settings/);
				assert.match(messages[0], /workspace settings override/);
			});

			test("does not copy inherited values when the User setting is absent", async () => {
				const workspace = ["inherited.js", localFile.toString()];
				await configure(undefined, workspace);
				await vscode.commands.executeCommand(command);
				assertValues([localFile.fsPath], workspace);
			});

			for (const representation of ["path", "URI"] as const) {
				test(`does not duplicate an existing file ${representation} on repeated selection`, async () => {
					const existing = ["keep.js", representation === "path" ? localFile.fsPath : localFile.toString()];
					await configure(existing, undefined);
					await vscode.commands.executeCommand(command);
					await vscode.commands.executeCommand(command);
					assertValues(existing, undefined);
				});
			}

			test("preserves non-file URIs and avoids repeated entries", async () => {
				selected = [vscode.Uri.parse("vscode-remote://ssh-remote+example/home/user/snippets%20file.js")];
				await configure([], undefined);
				await vscode.commands.executeCommand(command);
				await vscode.commands.executeCommand(command);
				assertValues([selected[0].toString()], undefined);
			});

			test("cancellation leaves all settings unchanged", async () => {
				await configure(["user.js"], ["workspace.js"]);
				selected = undefined;
				await vscode.commands.executeCommand(command);
				assertValues(["user.js"], ["workspace.js"]);
				assert.deepEqual(messages, []);
			});
		});
	}
});
