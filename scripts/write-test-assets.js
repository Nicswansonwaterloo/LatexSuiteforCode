const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDirectory = path.join(root, "out", "upstream");
fs.mkdirSync(outputDirectory, { recursive: true });

function writeAssets() {
	for (const name of ["default_snippets.js", "default_snippet_variables.js"]) {
		const source = fs.readFileSync(path.join(root, "src", "upstream", name), "utf8");
		fs.writeFileSync(
			path.join(outputDirectory, name),
			`"use strict";\nmodule.exports = ${JSON.stringify(source)};\n`,
			"utf8",
		);
	}
}
writeAssets();
if (process.argv.includes("--watch")) {
	fs.watch(path.join(root, "src", "upstream"), writeAssets);
}
