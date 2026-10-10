const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const yauzl = require('yauzl');
const manifest = require('../package.json');

const root = path.resolve(__dirname, '..');
const artifact = process.argv[2] ?? path.join(root, `${manifest.name}-${manifest.version}.vsix`);
const expected = ['package.json', 'README.md', 'LICENSE', 'UPSTREAM.md',
	'THIRD_PARTY_NOTICES.md', 'src/upstream/LICENSE.md', 'dist/extension.js', 'assets/icon.png'];

// vsce lowercases the README and adds .txt to an extensionless LICENSE.
const archiveName = file => `extension/${file === 'README.md' ? 'readme.md' : file === 'LICENSE' ? 'LICENSE.txt' : file}`;

async function main() {
	const archive = await new Promise((resolve, reject) => yauzl.open(artifact, { lazyEntries: true }, (error, zip) => error ? reject(error) : resolve(zip)));
	const entries = new Map();
	await new Promise((resolve, reject) => {
		archive.on('error', reject);
		archive.on('end', resolve);
		archive.on('entry', entry => {
			archive.openReadStream(entry, (error, stream) => {
				if (error) { reject(error); return; }
				const chunks = [];
				stream.on('error', reject);
				stream.on('data', chunk => chunks.push(chunk));
				stream.on('end', () => {
					assert.equal(entries.has(entry.fileName), false, `duplicate ZIP entry ${entry.fileName}`);
					entries.set(entry.fileName, Buffer.concat(chunks));
					archive.readEntry();
				});
			});
		});
		archive.readEntry();
	});
	assert.deepEqual([...entries.keys()].sort(), [...expected.map(archiveName), '[Content_Types].xml', 'extension.vsixmanifest'].sort());
	for (const file of expected.filter(file => file !== 'package.json')) {
		assert.deepEqual(entries.get(archiveName(file)), await fs.readFile(path.join(root, file)), `archive has stale ${file}`);
	}
	const packaged = JSON.parse(entries.get('extension/package.json').toString());
	for (const key of ['name', 'publisher', 'version', 'license', 'icon', 'repository', 'homepage', 'bugs', 'galleryBanner',
		'engines', 'main', 'activationEvents', 'capabilities', 'contributes']) {
		assert.deepEqual(packaged[key], manifest[key], `packaged ${key}`);
	}
	const meta = JSON.parse(await fs.readFile(path.join(root, 'dist/meta.json'), 'utf8'));
	const packages = [...new Set(Object.keys(meta.inputs).filter(file => file.startsWith('node_modules/')).map(file => file.split('/')[1]))];
	assert.deepEqual(packages, ['acorn'], 'review licenses when adding a runtime dependency');
	const acornLicense = await fs.readFile(path.join(root, 'node_modules/acorn/LICENSE'), 'utf8');
	// Git checkouts and npm dependencies can use different line endings on Windows.
	const normalizeLineEndings = text => text.replace(/\r\n?/g, '\n');
	assert.ok(normalizeLineEndings(entries.get('extension/THIRD_PARTY_NOTICES.md').toString())
		.includes(normalizeLineEndings(acornLicense).trim()),
		'packaged third-party notices must include the complete Acorn license');
	console.log(`Verified ${artifact}: ${entries.size} entries; runtime, icon, manifest, and licenses match the working tree.`);
	console.log([...entries.keys()].sort().join('\n'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
