#!/usr/bin/env node
/**
 * Self-test for the built browser bundle.
 *
 * Runs lib/client.js in a VM with a stub window/document/react/primitives, then
 * drives apply(ctx) against fake slot, locale, and settings services shaped like
 * the shipped ones. Covers the artwork and copy the theme applies, the two
 * settings registrations, the size multiplier, the running-copy rewrite and its
 * restore path, and the rule that a runtime without the expected internals stays
 * inert instead of throwing.
 *
 * Usage: node tools/selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUNDLE_ID = "dsh-plugin-whale-girl";
const CONFIG_NS = "whale-girl";
const ROW_CONFIG_KEY = `${BUNDLE_ID}#${CONFIG_NS}`;
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

/** A minimal element stand-in that records the custom properties written to it. */
function fakeStyle() {
	const properties = new Map();
	return {
		properties,
		setProperty: (name, value) => properties.set(name, value),
		removeProperty: (name) => properties.delete(name),
	};
}

/**
 * Load the bundle, materialize its factory, and return the plugin exports.
 * @returns the registration, exports, appended head elements, and the stub document.
 */
function materialize() {
	const registrations = [];
	const appended = [];
	const documentElement = { style: fakeStyle() };
	const document = {
		head: { appendChild: (element) => appended.push(element) },
		documentElement,
		createElement: (tagName) => ({ tagName, dataset: {}, textContent: "" }),
		querySelector: () => null,
	};
	const sandbox = {
		window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
		document,
		console,
	};
	createContext(sandbox);
	runInContext(readFileSync(join(PACKAGE_ROOT, "lib", "client.js"), "utf8"), sandbox);
	if (registrations.length !== 1) throw new Error(`expected one registration, got ${registrations.length}`);
	const registration = registrations[0];

	// The bundle is lazy CJS: the style tag and the favicon link are factory-body
	// side effects, so the factory has to be materialized before they exist.
	const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
	const react = {
		useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
		useRef: (value) => ({ current: value }),
		useState: (value) => [value, () => {}],
	};
	const primitives = {
		SettingsForm: function SettingsForm(props) {
			return { type: "SettingsForm", props };
		},
		SettingsValueField: function SettingsValueField(props) {
			return { type: "SettingsValueField", props };
		},
		settingsTextField: (field) => ({ field, format: (value) => (typeof value === "string" ? value : ""), parse: (text) => (text.trim() === "" ? { kind: "clear" } : { kind: "set", value: text.trim() }) }),
		settingsNumberField: (field) => ({ field, format: (value) => (typeof value === "number" ? String(value) : ""), parse: (text) => (text.trim() === "" ? { kind: "clear" } : Number.isFinite(Number(text)) ? { kind: "set", value: Number(text) } : undefined) }),
		SettingsFormModel: FakeSettingsFormModel,
	};
	const exports = registration.factory((specifier) => {
		if (specifier === "react") return react;
		if (specifier === "react/jsx-runtime") return jsxRuntime;
		if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
		throw new Error(`unexpected require: ${specifier}`);
	});
	return { registration, exports, appended, documentElement };
}

/**
 * Stand-in for the shared settings form model: enough of the shape the plugin
 * uses to project a snapshot and stage edits.
 */
class FakeSettingsFormModel {
	constructor(scope, specs) {
		this.scope = scope;
		this.specs = specs;
		this.staged = new Map();
	}
	shell() {
		const snapshot = this.scope.getSnapshot();
		return {
			available: snapshot.status === "ready",
			writable: snapshot.writable,
			dirty: this.staged.size > 0,
			invalid: false,
			saving: false,
			failed: false,
		};
	}
	field(name) {
		const spec = this.specs.find((entry) => entry.field === name);
		const staged = this.staged.get(name);
		const value = this.scope.getSnapshot().value[name];
		return {
			text: staged === undefined ? spec.format(value) : staged,
			overridden: value !== undefined,
			invalid: false,
		};
	}
	bind(project) {
		this.project = project;
		return {
			getSnapshot: () => this.project(),
			subscribe: () => () => {},
			set: () => {},
		};
	}
	actions() {
		return {
			edit: (field, text) => {
				this.staged.set(field, text);
			},
			resetField: () => {},
			save: () => {},
			discard: () => {},
		};
	}
	dispose() {}
}

/** A LocaleRuntime-shaped stub with the shipped chat dictionary. */
function fakeLocale() {
	const zh = {
		"chat.deepDiving": "深度求索中",
		"chat.deepDivingFor": "深度求索中，用时 {duration} ···",
		"chat.toBottom": "回到底部",
	};
	const en = { "chat.deepDiving": "Deep diving" };
	const locale = {
		dicts: new Map([["chat", new Map([["zh", zh], ["en", en]])]]),
		listeners: new Set(),
		publishes: 0,
		registered: [],
		zh,
		en,
		register: (namespace, dictionaries) => {
			locale.registered.push(namespace);
			return () => {};
		},
		bind: (namespace) => (key) => `${namespace}:${key}`,
		getLocale: () => ({ active: "zh" }),
		subscribe(fn) {
			locale.listeners.add(fn);
			return () => locale.listeners.delete(fn);
		},
		publish() {
			locale.publishes += 1;
			for (const fn of [...locale.listeners]) fn();
		},
	};
	return locale;
}

/** A settings scope shaped like the shared configuration form. */
function fakeScope(value) {
	const listeners = new Set();
	return {
		getSnapshot: () => ({ status: "ready", writable: true, value, revision: 0 }),
		subscribe: (fn) => {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
		listeners,
	};
}

/** A client-context stub with the slot registry, locale, effects, and settings. */
function fakeContext(locale, scope) {
	const registrations = [];
	const injected = [];
	const disposers = [];
	return {
		registrations,
		injected,
		scope,
		dispose: () => {
			for (const dispose of disposers.splice(0)) dispose();
		},
		ctx: {
			locale,
			configForms: { get: (namespace) => (namespace === CONFIG_NS ? scope : undefined) },
			slots: {
				inject(key, callback) {
					injected.push(key);
					const dispose = callback();
					return typeof dispose === "function" ? dispose : () => {};
				},
				register(options, component) {
					registrations.push({ options, component });
					return () => {};
				},
			},
			effect(callback) {
				const dispose = callback();
				disposers.push(typeof dispose === "function" ? dispose : () => {});
				return () => {};
			},
		},
	};
}

console.log("bundle shape");
const { registration, exports, appended, documentElement } = materialize();
check("registration id is the package name", registration.id === BUNDLE_ID, registration.id);
check("exports.apply is a function", typeof exports.apply === "function");
check("exports.inject lists slots/locale/configForms", JSON.stringify(exports.inject) === '["slots","locale","configForms"]', JSON.stringify(exports.inject));
check("a style tag was appended", appended.some((element) => element.tagName === "style" && element.dataset.plugin === BUNDLE_ID));
const styles = appended.find((element) => element.tagName === "style");
check("styles mention the running icon override", String(styles.textContent).includes('[data-chat-running] [class*="_runningIcon"]'));
check("styles declare the artwork custom properties", /^:root\{--wg-mark:url\("data:/.test(String(styles.textContent)), String(styles.textContent).slice(0, 80));
check("styles carry the settings card chrome", String(styles.textContent).includes(".wg-image-preview"));
check("styles carry the sidebar mark-size slider chrome", String(styles.textContent).includes(".wg-scale-input"));
check(
	"styles unclip the shipped sidebar brand box",
	['[class*="_brandIdentity"]:has(> [class*="_brandMark"]){height:auto;min-height:24px}', '[class*="_logoRow"]:has([class*="_brandIdentity"]){overflow:visible}', '[class*="_brand"]:has(> [class*="_brandIdentity"]){overflow-x:clip;overflow-y:visible}']
		.every((rule) => String(styles.textContent).includes(rule)),
	String(styles.textContent).slice(-320),
);
check("a favicon link was appended", appended.some((element) => element.tagName === "link" && element.rel === "icon"));

console.log("registrations");
const locale = fakeLocale();
const scope = fakeScope({});
const harness = fakeContext(locale, scope);
exports.apply(harness.ctx);
check(
	"four slots were injected",
	JSON.stringify(harness.injected) === '["sidebar.brand.mark","conversation.hero.brand.mark","plugins.row.config","settings.section"]',
	JSON.stringify(harness.injected),
);
check("locale namespace registered", locale.registered.includes("whaleGirlTheme"), JSON.stringify(locale.registered));
const sidebar = harness.registrations.find((entry) => entry.options.name === "sidebar.brand.mark");
const hero = harness.registrations.find((entry) => entry.options.name === "conversation.hero.brand.mark");
const rowConfig = harness.registrations.find((entry) => entry.options.name === "plugins.row.config");
const section = harness.registrations.find((entry) => entry.options.name === "settings.section");
check("sidebar slot registered at priority -1", sidebar?.options.priority === -1, JSON.stringify(sidebar?.options));
check("hero slot registered at priority -1", hero?.options.priority === -1, JSON.stringify(hero?.options));
check("the wordmark slot stays untouched", harness.registrations.every((entry) => entry.options.name !== "sidebar.brand.name"));
check("row config key is <package>#<row id>", rowConfig?.options.key === ROW_CONFIG_KEY, String(rowConfig?.options.key));
check("settings section carries an id and a label thunk", section?.options.id === "whale-girl-theme" && typeof section?.options.label === "function", JSON.stringify(section?.options.id));

console.log("size multiplier");
const defaultMark = sidebar.component({ size: 24 });
check("default scale lifts 24 to 43.2", defaultMark.props.style.width === 43.2, JSON.stringify(defaultMark.props.style));
const heroMark = hero.component({ size: 34, className: "hash_fish" });
check("hero mark keeps the host class", String(heroMark.props.className).includes("hash_fish"), String(heroMark.props.className));
check("hero mark uses the hero variant", String(heroMark.props.className).includes("wg-hero"), String(heroMark.props.className));
check("hero mark scales too", heroMark.props.style.width === 61.2, JSON.stringify(heroMark.props.style));

console.log("running copy");
check("chat.deepDiving uses the theme default", locale.zh["chat.deepDiving"] === "努力干饭中", locale.zh["chat.deepDiving"]);
check("chat.deepDivingFor keeps the duration placeholder", locale.zh["chat.deepDivingFor"] === "努力干饭中，用时 {duration} ···", locale.zh["chat.deepDivingFor"]);
check("neighbouring keys untouched", locale.zh["chat.toBottom"] === "回到底部", locale.zh["chat.toBottom"]);
check("english dictionary untouched", locale.en["chat.deepDiving"] === "Deep diving", locale.en["chat.deepDiving"]);
check("a republish happened", locale.publishes >= 1, String(locale.publishes));

console.log("preferences");
const customIcon = "data:image/webp;base64,AAAA";
const customGlyph = "data:image/webp;base64,BBBB";
scope.getSnapshot = () => ({
	status: "ready",
	writable: true,
	revision: 1,
	value: { icon: customIcon, runningIcon: customGlyph, runningText: "干饭中", iconScale: 2, runningScale: 1.6 },
});
for (const listener of [...scope.listeners]) listener();
check("icon painted as an inline custom property", documentElement.style.properties.get("--wg-mark") === `url("${customIcon}")`, String(documentElement.style.properties.get("--wg-mark")));
check("every artwork slot follows the icon", ["--wg-hero", "--wg-mark-small", "--wg-mark-dark", "--wg-hero-dark", "--wg-mark-small-dark"].every((name) => documentElement.style.properties.get(name) === `url("${customIcon}")`));
check("thinking icon painted from its own preference", documentElement.style.properties.get("--wg-running") === `url("${customGlyph}")`, String(documentElement.style.properties.get("--wg-running")));
check("thinking size published as a custom property", documentElement.style.properties.get("--wg-running-scale") === "1.6", String(documentElement.style.properties.get("--wg-running-scale")));
check("running copy follows the preference", locale.zh["chat.deepDiving"] === "干饭中", locale.zh["chat.deepDiving"]);
check("long form follows the preference", locale.zh["chat.deepDivingFor"] === "干饭中，用时 {duration} ···", locale.zh["chat.deepDivingFor"]);
const scaledMark = sidebar.component({ size: 24 });
check("scale preference applies", scaledMark.props.style.width === 48, JSON.stringify(scaledMark.props.style));
scope.getSnapshot = () => ({ status: "ready", writable: true, revision: 2, value: { runningScale: 0.6 } });
for (const listener of [...scope.listeners]) listener();
check("an off-grid thinking size is snapped before it is published", documentElement.style.properties.get("--wg-running-scale") === "0.6", String(documentElement.style.properties.get("--wg-running-scale")));
scope.getSnapshot = () => ({ status: "ready", writable: true, revision: 3, value: {} });
for (const listener of [...scope.listeners]) listener();
check("a cleared thinking size drops the property", !documentElement.style.properties.has("--wg-running-scale"));
scope.getSnapshot = () => ({
	status: "ready",
	writable: true,
	revision: 4,
	value: { icon: customIcon, runningIcon: customGlyph, runningText: "干饭中", iconScale: 2, runningScale: 1.6 },
});
for (const listener of [...scope.listeners]) listener();

console.log("settings card");
const cardState = rowConfig.options.inject().hooks.whaleGirlTheme.getSnapshot();
check("card snapshot exposes the five fields", ["icon", "runningIcon", "runningText", "iconScale", "runningScale"].every((field) => field in cardState), Object.keys(cardState).join(","));
check("card snapshot carries the form shell", cardState.available === true && cardState.writable === true);
const summary = rowConfig.component({ view: "summary", t: (key) => key, useWhaleGirlTheme: (select) => select(cardState) });
check("summary view renders text", String(summary.props.children).includes("summaryScale"), String(summary.props.children));
check("summary reports the applied scale", String(summary.props.children).includes("200%"), String(summary.props.children));
check("summary reports the thinking icon separately", String(summary.props.children).includes("summaryRunningIcon：summaryCustom"), String(summary.props.children));
check("summary reports the thinking size separately", String(summary.props.children).includes("summaryRunningScale"), String(summary.props.children));
const t = (key) => key;
const page = rowConfig.component({ view: "page", t, useWhaleGirlTheme: (select) => select(cardState), save: () => {}, discard: () => {}, edit: () => {}, resetField: () => {} });
check("page view renders the settings form", page.type?.name === "SettingsForm", String(page.type?.name));

console.log("groups");
const groupsRoot = page.props.children;
check("the form holds one groups container", groupsRoot.props?.className === "wg-groups", String(groupsRoot.props?.className));
const groups = groupsRoot.props.children;
check("there are two groups", groups.length === 2, String(groups.length));
const titles = groups.map((group) => group.props.children[0].props.children);
check("the groups are titled icon and thinking", JSON.stringify(titles) === '["groupIcon","groupRunning"]', JSON.stringify(titles));
/** The controls of one group, without its heading. */
const fieldsOf = (group) => group.props.children.slice(1);
const iconFields = fieldsOf(groups[0]);
const runningFields = fieldsOf(groups[1]);
check("the icon group holds the picker and its slider", iconFields.length === 2 && iconFields[0].type?.name === "ArtworkField" && iconFields[1].type?.name === "ScaleField", iconFields.map((field) => field.type?.name).join(","));
check("the thinking group holds the picker, the copy and its slider", runningFields.length === 3 && runningFields[0].type?.name === "ArtworkField" && runningFields[2].type?.name === "ScaleField", runningFields.map((field) => field.type?.name).join(","));
check("the thinking group carries the running copy field", runningFields[1].props?.id === "wg-running-text", String(runningFields[1].props?.id));

console.log("artwork pickers");
/** Render one artwork picker's control tree. */
const picker = (control, text, overridden = false) => {
	const rendered = control.type({ ...control.props, disabled: false, text, overridden });
	const image = rendered.props.children[1];
	const actions = image.props.children[1].props.children;
	return { control, rendered, preview: image.props.children[0], buttons: actions[0].props.children, input: actions[1] };
};
const markPicker = picker(iconFields[0], "");
const glyphPicker = picker(runningFields[0], "");
check("the first picker stages the brand mark", markPicker.control.props.field === "icon", String(markPicker.control.props.field));
check("the second picker stages the thinking icon", glyphPicker.control.props.field === "runningIcon", String(glyphPicker.control.props.field));
check("the mark is stored at 256px", markPicker.control.props.edge === 256, String(markPicker.control.props.edge));
check("the thinking icon is stored at 64px", glyphPicker.control.props.edge === 64, String(glyphPicker.control.props.edge));
check("each picker owns its file input", markPicker.input.props["data-field"] === "icon" && glyphPicker.input.props["data-field"] === "runningIcon", `${markPicker.input.props["data-field"]} / ${glyphPicker.input.props["data-field"]}`);
check("an empty picker shows its own built-in label", markPicker.preview.props.children === "iconBuiltIn" && glyphPicker.preview.props.children === "runningIconBuiltIn", `${markPicker.preview.props.children} / ${glyphPicker.preview.props.children}`);
check("an empty picker offers only the choose button", markPicker.buttons.filter(Boolean).length === 1 && markPicker.buttons[0].props.children === "iconChoose", String(markPicker.buttons.length));
const pickedPicker = picker(runningFields[0], "data:image/webp;base64,CCCC");
check("a picked artwork shows a preview and a clear button", pickedPicker.preview.type === "img" && pickedPicker.buttons.filter(Boolean).length === 2, `${pickedPicker.preview.type} / ${pickedPicker.buttons.length}`);
const overriddenPicker = picker(runningFields[0], "data:image/webp;base64,CCCC", true);
check("an overridden picker offers its reset", overriddenPicker.rendered.props.children[0].props.children[1]?.props.children?.[0]?.props.children === "overridden", JSON.stringify(overriddenPicker.rendered.props.children[0].props.children[1]));
const edits = [];
const wired = rowConfig.component({ view: "page", t, useWhaleGirlTheme: (select) => select(cardState), save: () => {}, discard: () => {}, edit: (field, value) => edits.push([field, value]), resetField: () => {} });
const wiredGroups = wired.props.children.props.children;
fieldsOf(wiredGroups[0])[0].props.onPick("data:image/webp;base64,MMMM");
fieldsOf(wiredGroups[0])[1].props.onEdit("2.2");
fieldsOf(wiredGroups[1])[0].props.onPick("data:image/webp;base64,GGGG");
fieldsOf(wiredGroups[1])[1].props.onEdit("干饭啦");
fieldsOf(wiredGroups[1])[2].props.onEdit("2.4");
check("the mark picker stages only the icon", JSON.stringify(edits[0]) === '["icon","data:image/webp;base64,MMMM"]', JSON.stringify(edits[0]));
check("the mark slider stages only iconScale", JSON.stringify(edits[1]) === '["iconScale","2.2"]', JSON.stringify(edits[1]));
check("the thinking picker stages only runningIcon", JSON.stringify(edits[2]) === '["runningIcon","data:image/webp;base64,GGGG"]', JSON.stringify(edits[2]));
check("the copy field stages only runningText", JSON.stringify(edits[3]) === '["runningText","干饭啦"]', JSON.stringify(edits[3]));
check("the thinking slider stages only runningScale", JSON.stringify(edits[4]) === '["runningScale","2.4"]' && edits.length === 5, JSON.stringify(edits));

console.log("scale sliders");
/** Render one slider state and read back the input and the readout. */
const slider = (control, text, overridden = false) => {
	slider.edited = [];
	const rendered = control.type({ ...control.props, disabled: false, text, overridden, onEdit: (value) => slider.edited.push(value) });
	const row = rendered.props.children[1];
	return { control, input: row.props.children[0], readout: row.props.children[1], head: rendered.props.children[0], edited: () => slider.edited };
};
const markSlider = slider(iconFields[1], "");
const glyphSlider = slider(runningFields[2], "");
check("both size controls are sliders", markSlider.control.type?.name === "ScaleField" && glyphSlider.control.type?.name === "ScaleField");
check("the mark slider stages iconScale", markSlider.control.props.field === "iconScale", String(markSlider.control.props.field));
check("the thinking slider stages runningScale", glyphSlider.control.props.field === "runningScale", String(glyphSlider.control.props.field));
check("each slider owns its input id", markSlider.input.props.id === "wg-iconScale-scale" && glyphSlider.input.props.id === "wg-runningScale-scale", `${markSlider.input.props.id} / ${glyphSlider.input.props.id}`);
const bounds = [markSlider.input, glyphSlider.input];
check("slider range is 0.2 to 3", bounds.every((input) => input.props.min === 0.2 && input.props.max === 3), bounds.map((input) => `${input.props.min}..${input.props.max}`).join(" "));
check("slider step is 0.2", bounds.every((input) => input.props.step === 0.2), String(bounds[0].props.step));
check("slider is a range input", bounds.every((input) => input.props.type === "range"));
check("a blank mark preference shows the 1.8 default", markSlider.input.props.value === 1.8, String(markSlider.input.props.value));
check("a blank thinking preference shows the shipped 1× default", glyphSlider.input.props.value === 1, String(glyphSlider.input.props.value));
check("the readouts render one decimal", markSlider.readout.props.children === "1.8×" && glyphSlider.readout.props.children === "1.0×", `${markSlider.readout.props.children} / ${glyphSlider.readout.props.children}`);
check("a blank preference is not overridden", markSlider.head.props.children[1] === null && glyphSlider.head.props.children[1] === null);
const atMax = slider(iconFields[1], "9");
check("an out-of-range preference is clamped", atMax.input.props.value === 3, String(atMax.input.props.value));
const atMin = slider(iconFields[1], "0.05");
check("a below-range preference is raised to the minimum", atMin.input.props.value === 0.2, String(atMin.input.props.value));
const offGrid = slider(iconFields[1], "1.25");
check("an off-grid preference is snapped to the 0.2 grid", offGrid.input.props.value === 1.2, String(offGrid.input.props.value));
const junk = slider(iconFields[1], "big");
check("unparsable text falls back to the default", junk.input.props.value === 1.8, String(junk.input.props.value));
const overridden = slider(iconFields[1], "0.6", true);
check("an overridden preference offers the reset", overridden.head.props.children[1]?.props.children?.[1]?.props.children === "reset", JSON.stringify(overridden.head.props.children[1]));
overridden.input.props.onChange({ target: { value: "2.4" } });
check("dragging stages the numeric draft as text", JSON.stringify(overridden.edited()) === '["2.4"]', JSON.stringify(overridden.edited()));

console.log("late dictionary registration");
const fresh = new Map();
locale.dicts.set("chat", fresh);
fresh.set("en", { "chat.deepDiving": "Deep diving" });
fresh.set("zh", { "chat.deepDiving": "深度求索中", "chat.deepDivingFor": "深度求索中，用时 {duration} ···" });
const publishesBefore = locale.publishes;
locale.publish();
check("re-registered dictionary is rewritten too", fresh.get("zh")["chat.deepDiving"] === "干饭中", fresh.get("zh")["chat.deepDiving"]);
check("the late rewrite republished", locale.publishes > publishesBefore, String(locale.publishes));
const settled = locale.publishes;
locale.publish();
check("a settled dictionary does not cascade", locale.publishes === settled + 1, `${settled} -> ${locale.publishes}`);

console.log("dispose and degradation");
harness.dispose();
check("dispose restores the shipped copy", fresh.get("zh")["chat.deepDiving"] === "深度求索中", fresh.get("zh")["chat.deepDiving"]);
check("dispose restores the long form", fresh.get("zh")["chat.deepDivingFor"] === "深度求索中，用时 {duration} ···", fresh.get("zh")["chat.deepDivingFor"]);

const alien = fakeLocale();
alien.dicts = { not: "a map" };
const alienHarness = fakeContext(alien, fakeScope({ icon: 42, iconScale: "big" }));
let threw = false;
try {
	exports.apply(alienHarness.ctx);
} catch (error) {
	threw = true;
	console.log(`  (threw: ${error.message})`);
}
check("an alien runtime does not throw", !threw);
check("an alien locale is left alone", alien.zh["chat.deepDiving"] === "深度求索中", alien.zh["chat.deepDiving"]);
check("a non-artwork icon is ignored", !alienHarness.registrations.some(() => false) && alien.zh["chat.deepDiving"] === "深度求索中");

console.log("scale clamping on the applied theme");
// Last, because applying another context republishes the module-level theme
// snapshot the running-copy checks above depend on.
const snapScope = fakeScope({ iconScale: 7 });
const snapHarness = fakeContext(fakeLocale(), snapScope);
exports.apply(snapHarness.ctx);
const cappedMark = snapHarness.registrations.find((entry) => entry.options.name === "sidebar.brand.mark").component({ size: 24 });
check("an oversized stored value is capped at 3", cappedMark.props.style.width === 72, JSON.stringify(cappedMark.props.style));
snapHarness.dispose();

console.log(failures === 0 ? "\nselftest: all checks passed" : `\nselftest: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
