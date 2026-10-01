/**
 * Patch-layer inspection for this bundle's own Loader row.
 *
 * The row id is the settings namespace the Host serves, so a patch layer that
 * declares it a second time silently breaks saving: `ConfigEditor` folds a form
 * write onto the LAST row carrying the id while its read-back guard inspects the
 * FIRST one, which refuses every write as "overridden by a home patch or
 * command-line overlay". Detecting that needs nothing but the patch text, so the
 * decision lives here — dependency-free — and `lib/index.js` supplies the files.
 *
 * @module dsh-plugin-whale-girl/rows
 */

/** The Loader row id this bundle's own `cordis.patch.yml` inserts, and the settings namespace it owns. */
export const ROW_ID = "whale-girl";

/**
 * Build the matcher for one row id: a top-level entry-list item that declares it.
 * @param rowId - the row id to match.
 * @returns a regular expression anchored to a single line.
 */
function rowPattern(rowId) {
	const escaped = rowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^\\s*-\\s.*\\bid\\s*:\\s*['"]?${escaped}['"]?\\s*(?:,|$|\\})`);
}

/**
 * Count the top-level list rows one patch document declares for a row id.
 *
 * Both spellings of an entry-list item count — the block form
 * (`- id: whale-girl`) and the flow form (`- {id: whale-girl, ...}`) — while
 * prose that merely mentions the id, and a commented-out row, do not.
 *
 * @param text - one patch document's source.
 * @param rowId - the row id to look for.
 * @returns how many rows in that document carry the id.
 */
export function declaredRows(text, rowId = ROW_ID) {
	const pattern = rowPattern(rowId);
	let rows = 0;
	for (const line of text.split(/\r?\n/)) if (pattern.test(line)) rows += 1;
	return rows;
}

/**
 * The warning one patch document earns, or nothing when it is clean.
 *
 * @param document - the patch document's path, named in the message.
 * @param text - that document's source.
 * @param rowId - the row id to look for.
 * @returns the message to log, or undefined for a document that declares no row.
 */
export function duplicateRowWarning(document, text, rowId = ROW_ID) {
	if (declaredRows(text, rowId) === 0) return undefined;
	return `whale-girl: ${document} declares the entry row ${rowId}, which this bundle's own cordis.patch.yml already inserts. `
		+ "While the id appears twice every settings save is refused and the theme stays on its built-in sizes; "
		+ "remove that duplicate insert row and restart the application.";
}
