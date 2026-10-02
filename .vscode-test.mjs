import { defineConfig } from '@vscode/test-cli';
import { mkdirSync, writeFileSync } from 'node:fs';

// Real configuration tests use disposable workspace files, never the project.
const workspace = new URL('./.vscode-test/configuration-workspace/', import.meta.url);
for (const folder of ['first', 'second']) {
	mkdirSync(new URL(folder, workspace), { recursive: true });
}
writeFileSync(new URL('test.code-workspace', workspace), JSON.stringify({
	folders: [{ path: 'first' }, { path: 'second' }],
}));

const common = {
	launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes'],
	mocha: { timeout: 10_000 },
};

export default defineConfig([
	{
		...common,
		label: 'editor',
		files: 'out/test/!(add-source-file|multi-root|lifecycle).test.js',
	},
	{
		...common,
		label: 'configuration',
		files: ['out/test/add-source-file.test.js', 'out/test/multi-root.test.js'],
		workspaceFolder: '.vscode-test/configuration-workspace/test.code-workspace',
	},
	{ ...common, label: 'lifecycle', files: 'out/test/lifecycle.test.js' },
]);
