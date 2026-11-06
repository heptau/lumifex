/**
 * Shows how complete the translations are, measured against the Czech dictionary (the reference one).
 * Usage:
 *   node scripts/translations-report.js          a table: language, translated keys, missing keys, coverage
 *   node scripts/translations-report.js de       also lists the keys that are missing in de.json
 * en-GB.json is only a small overlay of British spellings, so it is not measured. Read-only.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/js/languages');
const SKIP = ['cs.json', 'empty.json', 'en-GB.json'];

function read(name) {
	return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

/**
 * @param {Object<string,string>} reference dictionary that defines the keys
 * @param {Object<string,string>} dictionary
 * @returns {{translated: number, missing: string[], total: number}} a key counts as translated when it has a non-empty
 *          value that differs from the key (an empty or identical value is not a translation)
 */
function compare(reference, dictionary) {
	const keys = Object.keys(reference);
	const missing = keys.filter((key) => typeof dictionary[key] !== 'string' || dictionary[key] === '' || dictionary[key] === key);
	return {translated: keys.length - missing.length, missing, total: keys.length};
}

function main(argv) {
	const wanted = argv[0] ? argv[0].replace(/\.json$/, '') : null;
	const reference = read('cs.json');
	const rows = fs.readdirSync(dir)
		.filter((name) => name.endsWith('.json') && !SKIP.includes(name))
		.sort()
		.map((name) => ({name: name.replace(/\.json$/, ''), ...compare(reference, read(name))}));

	console.log(`Reference: cs.json (${Object.keys(reference).length} keys)\n`);
	for (const row of rows) {
		const percent = (row.translated / row.total * 100).toFixed(1).padStart(5);
		console.log(`${row.name.padEnd(6)} ${String(row.translated).padStart(5)} translated, ${String(row.missing.length).padStart(4)} missing  ${percent} %`);
	}
	if (wanted) {
		const row = rows.find((item) => item.name === wanted);
		if (!row) {
			console.error(`\nUnknown language "${wanted}".`);
			process.exitCode = 1;
			return;
		}
		console.log(`\nMissing in ${wanted}.json:`);
		row.missing.forEach((key) => console.log(`  ${key}`));
	}
}

if (require.main === module) {
	main(process.argv.slice(2));
}

module.exports = {compare};
