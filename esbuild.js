const esbuild = require("esbuild");
const path = require("node:path");
const fs = require("node:fs");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		absWorkingDir: __dirname,
		entryPoints: [
			path.join(__dirname, 'src/extension.ts')
		],
		bundle: true,
		metafile: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		loader: {
			'.js': 'text',
		},
		outfile: path.join(__dirname, 'dist/extension.js'),
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		if (production) {
			fs.rmSync(path.join(__dirname, 'dist/extension.js.map'), { force: true });
		}
		const result = await ctx.rebuild();
		fs.writeFileSync(path.join(__dirname, "dist/meta.json"), JSON.stringify(result.metafile, null, 2));
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
