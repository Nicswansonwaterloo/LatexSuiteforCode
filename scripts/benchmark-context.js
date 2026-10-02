// Run after compile-tests. These timings are diagnostic, not CI pass/fail thresholds.
const { performance } = require('node:perf_hooks');
const { parseContext } = require('../out/core/context');
const line = 'Notes on $x^2 + \\frac{1}{y}$ with `code` and regular prose.\n';
for (const count of [200, 2000, 10000]) {
	const source = line.repeat(count) + '$x$';
	const parsing = [];
	const queries = [];
	for (let run = 0; run < 9; run++) {
		const start = performance.now();
		const parsed = parseContext(source);
		parsing.push(performance.now() - start);
		const queryStart = performance.now();
		for (let cursor = 0; cursor < 100; cursor++) {
			parsed.at(Math.floor(cursor * source.length / 100));
		}
		queries.push((performance.now() - queryStart) / 100);
	}
	const median = values => values.sort((a, b) => a - b)[4].toFixed(3);
	console.log(`${source.length} characters: parse ${median(parsing)} ms; cursor query ${median(queries)} ms`);
}
