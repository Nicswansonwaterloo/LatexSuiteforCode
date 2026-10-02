const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { downloadAndUnzipVSCode, runTests, runVSCodeCommand } = require('@vscode/test-electron');
const manifest = require('../package.json');

async function main() {
	const restricted = process.argv.includes('--restricted');
	const version = process.env.VSCODE_VERSION ?? 'stable';
	const root = path.resolve(__dirname, '..');
	const artifact = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? path.join(root, `${manifest.name}-${manifest.version}.vsix`);
	await fs.access(artifact);
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'latex-suite-vsix-'));
	try {
		const userData = path.join(temporary, 'user-data');
		const installed = path.join(temporary, 'extensions');
		const harness = path.join(temporary, 'harness');
		const workspace = path.join(temporary, 'workspace');
		await Promise.all([fs.mkdir(harness), fs.mkdir(workspace), fs.mkdir(path.join(userData, 'User'), { recursive: true })]);
		await fs.writeFile(path.join(harness, 'package.json'), JSON.stringify({
			name: 'latex-suite-vsix-test-harness', publisher: 'local-tests', version: '0.0.0', engines: { vscode: manifest.engines.vscode },
			capabilities: { untrustedWorkspaces: { supported: true } },
		}));
		const marker = path.join(temporary, 'custom-source-executed');
		const trap = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); module.exports = [];`;
		await fs.writeFile(path.join(userData, 'User', 'settings.json'), JSON.stringify({
			'security.workspace.trust.enabled': true,
			'security.workspace.trust.startupPrompt': 'never',
			'workbench.startupEditor': 'none',
			...(restricted ? {
				'latexSuite.snippets.source': trap,
				'latexSuite.snippets.variablesSource': trap,
				'latexSuite.snippets.files': [path.join(workspace, 'trap.js')],
				'latexSuite.snippets.variableFiles': [path.join(workspace, 'trap.js')],
			} : {}),
		}));
		await fs.writeFile(path.join(workspace, 'trap.js'), trap);
		const vscodeExecutablePath = await downloadAndUnzipVSCode(version);
		const common = [`--user-data-dir=${userData}`, `--extensions-dir=${installed}`, '--skip-welcome', '--skip-release-notes', '--disable-updates'];
		await runVSCodeCommand([...common, '--install-extension', path.resolve(artifact), '--force'], { version });
		const extensionTestsPath = path.join(__dirname, 'fixtures/vsix-smoke.cjs');
		const env = { ...process.env, LATEX_SUITE_TEST_ID: `${manifest.publisher}.${manifest.name}`, LATEX_SUITE_INSTALLED_DIR: installed, LATEX_SUITE_RESTRICTED: restricted ? '1' : '0' };
		if (restricted) {
			// test-electron.runTests always adds --disable-workspace-trust. Launch
			// directly here so a fresh, untrusted workspace exercises the actual gate.
			delete env.ELECTRON_RUN_AS_NODE;
			const args = [workspace, ...common, '--no-sandbox', '--disable-gpu-sandbox', '--disable-telemetry', `--extensionDevelopmentPath=${harness}`, `--extensionTestsPath=${extensionTestsPath}`];
			await new Promise((resolve, reject) => {
				const child = spawn(vscodeExecutablePath, args, { env, stdio: 'inherit' });
				const timeout = setTimeout(() => { child.kill(); reject(new Error('Restricted Mode smoke timed out')); }, 90_000);
				child.on('error', error => { clearTimeout(timeout); reject(error); });
				child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`VS Code exited ${code}`)); });
			});
		} else {
			await runTests({ vscodeExecutablePath, extensionDevelopmentPath: harness, extensionTestsPath, extensionTestsEnv: env, launchArgs: common });
		}
		assert.equal(await fs.stat(marker).then(() => true, () => false), false, 'custom code ran in Restricted Mode');
	} finally {
		await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
