/**
 * Whale-girl theme plugin, node half.
 *
 * The theme itself is browser presentation only: every change ships through
 * `exports["./client"]`. This host face exists for three reasons:
 *
 * 1. the bundle's inserted Loader row resolves to a real Cordis plugin module;
 * 2. `Config` is what makes the `whale-girl` namespace a settings surface. The
 *    Host serves a namespace for every active entry whose schema declares
 *    `.volatile()` fields, keyed by the entry id, so declaring them here is the
 *    whole mechanism behind this plugin's settings page;
 * 3. the self-check below turns the one installation mistake that silently
 *    disables that settings page into a log line.
 *
 * Every field is `.required(false)`: absent means "use the built-in artwork /
 * copy / scale". A value the theme cannot use is clamped in the browser rather
 * than refused at load, so a bad edit can never stop the plugin from mounting.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { ROW_ID, duplicateRowWarning } from "./rows.js";

/** Editable preferences, spelled once so the volatile projection restates nothing. */
const ThemeFields = {
	/** Picked brand mark as a data URI, or absent for the built-in artwork. */
	icon: z.string().required(false),
	/** Picked thinking-status icon as a data URI, or absent for the built-in bowl. */
	runningIcon: z.string().required(false),
	/** Replacement for the zh running copy, or absent for the built-in 努力干饭中. */
	runningText: z.string().required(false),
	/** Multiplier for the sidebar and hero marks (slider, 0.2–3 in 0.2 steps). */
	iconScale: z.number().required(false),
	/** Multiplier for the thinking-status icon (slider, 0.2–3 in 0.2 steps); 1 is the shipped 14px box. */
	runningScale: z.number().required(false),
};

/**
 * The plugin's configuration schema. Only volatile fields reach the browser and
 * a settings form; ordinary fields would be composition config instead.
 */
export const Config = z.object({
	icon: ThemeFields.icon.volatile(),
	runningIcon: ThemeFields.runningIcon.volatile(),
	runningText: ThemeFields.runningText.volatile(),
	iconScale: ThemeFields.iconScale.volatile(),
	runningScale: ThemeFields.runningScale.volatile(),
});

/**
 * Warn about every patch document that declares this entry a second time.
 *
 * The bundle ships its own `cordis.patch.yml`, and listing the package in
 * `dsh.profile.bundles` is what inserts the row, so nothing else needs to (and
 * must not) insert it. A duplicate id survives into the composed entry list and
 * the settings document then refuses every write — the browser half cannot see
 * that refusal, so the condition is reported here, once, at load. The decision
 * itself lives in `./rows.js`, which is dependency-free and covered by
 * `tools/host-check.mjs`.
 *
 * @param ctx - the child context carrying `profileContext`.
 */
function reportDuplicateRows(ctx) {
	const profile = ctx.profileContext;
	const documents = [profile.patchPath, join(profile.home, "cordis.patch.yml")];
	for (const document of documents) {
		let text;
		try {
			text = readFileSync(document, "utf8");
		} catch {
			continue;
		}
		const warning = duplicateRowWarning(document, text, ROW_ID);
		if (warning !== undefined) ctx.logger.warn("%s", warning);
	}
}

/** Host plugin body — this package contributes browser presentation, plus a guarded installation self-check. */
export function apply(ctx) {
	// Optional and non-blocking: a deployment without a settings document keeps the
	// theme, and a self-check that throws must never keep it from mounting.
	try {
		ctx.inject(["profileContext"], (scope) => {
			try {
				reportDuplicateRows(scope);
			} catch (error) {
				scope.logger?.warn?.("whale-girl: installation self-check failed: %s", error?.message ?? error);
			}
		});
	} catch {
		/* the self-check is best-effort */
	}
}
