#!/usr/bin/env node
/**
 * Host-half check: the duplicate-row self-check that guards this plugin's
 * settings page, and — when the runtime can resolve the platform schema module —
 * the settings surface the node half declares.
 *
 * The self-check's decision logic lives in `lib/rows.js`, which is
 * dependency-free, so this runs with a plain `node` and no installed packages,
 * like every other check here:
 *
 *   node tools/host-check.mjs
 *
 * `lib/index.js` itself imports `@deepseek-ai/schemastery`, which only the
 * application's own runtime supplies; that section of the check runs when the
 * module can be loaded, and is reported as skipped otherwise.
 *
 * Usage: node tools/host-check.mjs
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { ROW_ID, declaredRows, duplicateRowWarning } = await import(new URL("../lib/rows.js", import.meta.url).href);

/** Fields the settings page must see, in the order the schema declares them. */
const EDITABLE = ["icon", "runningIcon", "runningText", "iconScale", "runningScale"];
let failures = 0;

/**
 * Assert one condition.
 * @param label - what is being asserted.
 * @param condition - the condition.
 * @param detail - extra text printed on failure.
 */
function check(label, condition, detail) {
	if (condition) {
		console.log(`  ok   ${label}`);
		return;
	}
	failures += 1;
	console.log(`  FAIL ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

/** A profile patch whose duplicate row was already removed, plus prose that mentions the id. */
const CLEAN_PATCH = [
	"# Whale-girl theme: the row comes from the bundle's OWN patch.",
	"# Do NOT add an `insert` row for `whale-girl` here.",
	"- id: ui-chat",
	"  config:",
	"    transcriptView: standard",
	"",
].join("\n");
/** A profile patch that inserts the row a second time, in block style. */
const DUPLICATE_PATCH = ["# a profile patch", "- insert:", "    - id: whale-girl", "      name: 'dsh-plugin-whale-girl'", ""].join("\n");
/** The same duplication in flow style. */
const FLOW_PATCH = "- insert: [{id: whale-girl, name: dsh-plugin-whale-girl}]\n";
/** A row that is commented out is not a row. */
const COMMENTED_PATCH = "# - id: whale-girl\n#   name: 'dsh-plugin-whale-girl'\n";

console.log("row detection");
check("the row id is the settings namespace", ROW_ID === "whale-girl");
check("a clean document declares no row", declaredRows(CLEAN_PATCH) === 0, String(declaredRows(CLEAN_PATCH)));
check("prose that mentions the id is not a row", declaredRows("# see whale-girl for details\n") === 0);
check("a commented-out row is not a row", declaredRows(COMMENTED_PATCH) === 0);
check("a block insert row is found", declaredRows(DUPLICATE_PATCH) === 1, String(declaredRows(DUPLICATE_PATCH)));
check("a flow insert row is found", declaredRows(FLOW_PATCH) === 1, String(declaredRows(FLOW_PATCH)));
check("two rows are counted twice", declaredRows(DUPLICATE_PATCH + DUPLICATE_PATCH) === 2, String(declaredRows(DUPLICATE_PATCH + DUPLICATE_PATCH)));
check("a quoted id is found", declaredRows("- id: 'whale-girl'\n") === 1);
check("another bundle's row is not this one", declaredRows("- id: whale-boy\n") === 0);
check("an unrelated row id is matched by its own name", declaredRows("- id: ui-chat\n", "ui-chat") === 1);

console.log("\nduplicate-row warning");
check("a clean document earns no warning", duplicateRowWarning("<patch>", CLEAN_PATCH) === undefined);
const warning = duplicateRowWarning("C:\\dsh\\profiles\\desktop\\cordis.patch.yml", DUPLICATE_PATCH);
check("a duplicated row earns a warning", typeof warning === "string");
check("the warning names the document", (warning ?? "").includes("cordis.patch.yml"), warning ?? "");
check("the warning names the row id", (warning ?? "").includes("whale-girl"), warning ?? "");
check("the warning names what the bundle already does", (warning ?? "").includes("already inserts"), warning ?? "");
check("the warning names the symptom", (warning ?? "").includes("every settings save is refused"), warning ?? "");
check("the warning names the remedy", (warning ?? "").includes("remove that duplicate insert row"), warning ?? "");

console.log("\nsettings surface");
try {
	const { Config, apply } = await import(new URL("../lib/index.js", import.meta.url).href);
	const dict = Config.dict ?? {};
	check("exactly the five editable fields", Object.keys(dict).length === EDITABLE.length && EDITABLE.every((field) => dict[field] !== undefined), Object.keys(dict).join(","));
	for (const field of EDITABLE) check(`${field} is volatile`, dict[field].meta.volatile === true);
	check("both multipliers are numbers", dict.iconScale.type === "number" && dict.runningScale.type === "number");
	check("no field is required", EDITABLE.every((field) => dict[field].meta.required === false));

	const warnings = [];
	let children = 0;
	const dir = mkdtempSync(join(tmpdir(), "whale-girl-host-"));
	const patchPath = join(dir, "cordis.patch.yml");
	writeFileSync(patchPath, CLEAN_PATCH);
	/** The Host shape this plugin's self-check consumes; the home layer is a separate, absent document. */
	const home = join(dir, "home");
	const context = {
		logger: { warn: (...args) => warnings.push(args.map(String).join(" ")) },
		inject(deps, callback) {
			children += 1;
			callback({ logger: { warn: (...args) => warnings.push(args.map(String).join(" ")) }, profileContext: { patchPath, home } });
			return { dispose() {} };
		},
	};
	apply(context);
	check("apply injects the self-check child", children === 1);
	check("a clean install warns about nothing", warnings.length === 0, warnings.join(" | "));
	writeFileSync(patchPath, DUPLICATE_PATCH);
	apply(context);
	check("a duplicated install warns once", warnings.length === 1, warnings.join(" | "));
	let threw = false;
	try {
		apply({ logger: { warn() {} }, inject() { throw new Error("inject unavailable"); } });
	} catch {
		threw = true;
	}
	check("an unavailable inject does not throw", threw === false);
} catch (error) {
	if (String(error?.code ?? "").includes("ERR_MODULE_NOT_FOUND")) {
		console.log("  skip the node half (this runtime cannot resolve @deepseek-ai/schemastery — run it under the application)");
	} else {
		failures += 1;
		console.log(`  FAIL the node half could not be loaded — ${error?.message ?? error}`);
	}
}

console.log(failures === 0 ? "\nhost-check: PASS" : `\nhost-check: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
