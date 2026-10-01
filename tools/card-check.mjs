#!/usr/bin/env node
/**
 * Card check: render the built settings card into real DOM and measure it.
 *
 * `selftest.mjs` proves the card's element tree has the shape the plugin intends;
 * this proves the browser agrees about the parts a tree cannot show — that the two
 * groups really lay out as two columns when there is room and one when there is
 * not, that both sliders carry the 0.2–3 / 0.2 geometry, that a group's first
 * field sits flush under its heading, and that the thinking-status box actually
 * changes size with the multiplier the card publishes.
 *
 * The card is rendered by expanding the element objects `react/jsx-runtime` would
 * have produced, so what is measured is the plugin's own markup and stylesheet,
 * not a hand-written copy of them.
 *
 * Usage: node tools/card-check.mjs [path to a chromium binary]
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BROWSERS = [
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const TIMEOUT_MS = 90_000;

/**
 * Read the named options the check takes.
 * @param argv - process arguments after the script name.
 * @returns the option map.
 */
function options(argv) {
	const parsed = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) {
			parsed.browser = token;
			continue;
		}
		const [name, inline] = token.slice(2).split("=");
		parsed[name] = inline ?? argv[index + 1];
	}
	return parsed;
}

/** The driver page: everything it reports is produced by the plugin's own code. */
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>whale-girl card check</title>
<style>html,body{margin:0;background:#fff;font-family:system-ui,sans-serif}
:root{--dsw-alias-border-l1:#e6e8ec;--dsw-alias-border-l2:#dcdfe4;--dsw-alias-label-primary:#1c1d20;
--dsw-alias-label-secondary:#6a6f78;--dsw-alias-interactive-bg-hover-solid:#eceef1;
--dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-state-error-primary:#c0392b}
#stage{padding:12px}
.cap{font-size:12px;color:#6a6f78;margin:14px 0 6px;padding-left:12px}
#narrow{width:380px;border:1px dashed #ccc;border-radius:8px;margin:0 0 16px 12px}
/* The shipped running-status box, minus its size: the plugin's rule owns that. */
[class*="_runningIcon"]{contain:strict;flex:none;display:inline-flex;position:relative;overflow:hidden}
</style></head>
<body><pre id="out" style="position:absolute;left:-9999px">running…</pre>
<div class="cap" id="wideCap">宽面板：两栏并排</div><div id="stage"></div>
<div class="cap">窄面板（380px）：自动堆成一列</div><div id="narrow"></div>
<script>
const report = [];
const say = (line) => report.push(line);
const post = (code) => fetch("/report", { method: "POST", body: JSON.stringify({ code, report }) }).catch(() => {});
const finish = (code) => { document.getElementById("out").textContent = code + "\\n" + report.join("\\n"); post(code); };
const jsxRuntime = { jsx: (type, props) => ({ type, props: props ?? {} }), jsxs: (type, props) => ({ type, props: props ?? {} }) };
const react = {
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => {}],
};
// Stand-ins for the host's form primitives: enough to lay the plugin's own
// controls out, and deliberately plain so nothing here paints the measurements.
const primitives = {
  SettingsForm: (props) => ({ type: "div", props: { className: "stub-form", children: props.children } }),
  SettingsValueField: (props) => ({ type: "div", props: { className: "wg-field", children: [
    { type: "span", props: { className: "wg-field-label", children: props.label } },
    { type: "input", props: { id: props.id, value: props.text, readOnly: true } },
  ] } }),
  settingsTextField: (field) => ({ field, format: (v) => (typeof v === "string" ? v : ""), parse: (t) => ({ kind: "set", value: t }) }),
  settingsNumberField: (field) => ({ field, format: (v) => (typeof v === "number" ? String(v) : ""), parse: (t) => ({ kind: "set", value: Number(t) }) }),
  SettingsFormModel: class {
    constructor(scope, specs) { this.scope = scope; this.specs = specs; this.staged = new Map(); }
    shell() { return { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false }; }
    field(name) { const spec = this.specs.find((s) => s.field === name); return { text: spec.format(this.scope.getSnapshot().value[name]), overridden: false, invalid: false }; }
    bind(project) { this.project = project; return { getSnapshot: () => this.project(), subscribe: () => () => {}, set: () => {} }; }
    actions() { return { edit: () => {}, resetField: () => {}, save: () => {}, discard: () => {} }; }
    dispose() {}
  },
};
const registrations = [];
window.__ModuleLoader__ = { load: (registration) => registrations.push(registration) };
window.addEventListener("error", (event) => post("PAGE-ERROR " + event.message));
setTimeout(() => post("STALLED"), 8000);
</script>
<script src="/client.js"></script>
<script>
const registration = registrations[0];
if (registration === undefined) { say("no registration"); finish("NO-REGISTRATION"); throw new Error("no registration"); }
const bundle = registration.factory((specifier) => {
  if (specifier === "react") return react;
  if (specifier === "react/jsx-runtime") return jsxRuntime;
  if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
  throw new Error("unexpected require: " + specifier);
});
const captured = {};
const locale = {
  dicts: new Map([["chat", new Map([["zh", { "chat.deepDiving": "深度求索中" }], ["en", {}]])]]),
  register: () => () => {}, bind: () => (key) => key, getLocale: () => ({ active: "zh" }),
  subscribe: () => () => {}, publish: () => {},
};
const ctx = {
  locale,
  configForms: { get: () => ({ getSnapshot: () => ({ status: "ready", writable: true, revision: 0, value: {} }), subscribe: () => () => {} }) },
  slots: { inject: (key, callback) => { callback(); }, register: (options, component) => { captured[options.name] = { options, component }; return () => {}; } },
  effect: (callback) => { callback(); return () => {}; },
};
bundle.apply(ctx);

/** Turn the element objects react/jsx-runtime would have produced into real DOM. */
const render = (node) => {
  if (node === null || node === undefined || node === false || node === true) return null;
  if (typeof node === "string" || typeof node === "number") return document.createTextNode(String(node));
  if (Array.isArray(node)) {
    const fragment = document.createDocumentFragment();
    for (const child of node) { const element = render(child); if (element !== null) fragment.appendChild(element); }
    return fragment;
  }
  if (typeof node.type === "function") return render(node.type(node.props));
  const element = document.createElement(node.type);
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (key === "children" || key === "ref" || value === null || value === undefined || value === false) continue;
    if (key === "style") { Object.assign(element.style, value); continue; }
    if (key.startsWith("on")) continue;
    if (key === "className") { element.className = value; continue; }
    element.setAttribute(key === "htmlFor" ? "for" : key, String(value));
  }
  const children = render(node.props?.children);
  if (children !== null) element.appendChild(children);
  return element;
};

const card = captured["plugins.row.config"];
const tree = card.component({
  view: "page",
  t: (key) => key,
  useWhaleGirlTheme: (select) => select(card.options.inject().hooks.whaleGirlTheme.getSnapshot()),
  save: () => {}, discard: () => {}, edit: () => {}, resetField: () => {},
});
const stage = document.getElementById("stage");
stage.appendChild(render(tree));

const results = [];
const check = (label, condition, detail) => { results.push({ label, ok: Boolean(condition), detail: detail === undefined ? "" : String(detail) }); say((condition ? "  ok   " : "  FAIL ") + label + (condition || detail === undefined ? "" : " — " + detail)); };

// Layout: two tracks when the panel is wide, one when it is not.
const groups = [...stage.querySelectorAll(".wg-group")];
check("two groups render", groups.length === 2, String(groups.length));
check("the group headings come from the dictionary", groups.map((group) => group.querySelector(".wg-group-title").textContent).join(",") === "groupIcon,groupRunning", groups.map((group) => group.querySelector(".wg-group-title")?.textContent).join(","));
// auto-fit reports the tracks it collapsed as 0px, so only sized tracks count.
const tracks = (element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter((part) => part !== "" && part !== "0px").length;
check("a wide panel lays the groups out in two columns", tracks(stage.querySelector(".wg-groups")) === 2, getComputedStyle(stage.querySelector(".wg-groups")).gridTemplateColumns);
const narrow = document.getElementById("narrow");
const wideCard = stage.querySelector(".wg-groups");
narrow.appendChild(wideCard.cloneNode(true));
check("a narrow panel falls back to one column", tracks(narrow.querySelector(".wg-groups")) === 1, getComputedStyle(narrow.querySelector(".wg-groups")).gridTemplateColumns);
check("the first field sits flush under its heading", getComputedStyle(groups[0].querySelector(".wg-field")).borderTopWidth === "0px", getComputedStyle(groups[0].querySelector(".wg-field")).borderTopWidth);

// Controls: two sliders with the shared geometry, and their readouts.
const sliders = [...stage.querySelectorAll("input.wg-scale-input")];
check("two size sliders render", sliders.length === 2, String(sliders.length));
check("both take the 0.2–3 geometry", sliders.every((slider) => slider.min === "0.2" && slider.max === "3" && slider.step === "0.2"), sliders.map((slider) => [slider.min, slider.max, slider.step].join("/")).join(" "));
check("the sliders start at their defaults", sliders.map((slider) => slider.value).join(",") === "1.8,1", sliders.map((slider) => slider.value).join(","));
const readouts = [...stage.querySelectorAll(".wg-scale-readout")].map((output) => output.textContent);
check("the readouts show the multipliers", readouts.join(",") === "1.8×,1.0×", readouts.join(","));
check("the thinking group owns the copy field", stage.querySelectorAll(".wg-group")[1].querySelector("#wg-running-text") !== null);

// The thinking-status box: our rule must size it from the published multiplier.
const makeRunningIcon = () => {
  const host = document.createElement("div");
  host.setAttribute("data-chat-running", "true");
  const box = document.createElement("span");
  box.className = "hash_runningIcon";
  host.appendChild(box);
  document.body.appendChild(host);
  return box;
};
const box = makeRunningIcon();
const boxWidth = () => box.getBoundingClientRect().width;
check("the thinking box keeps the shipped 14px at 1×", Math.abs(boxWidth() - 14) < 0.6, boxWidth().toFixed(2));
document.documentElement.style.setProperty("--wg-running-scale", "3");
check("a 3× preference triples it", Math.abs(boxWidth() - 42) < 0.6, boxWidth().toFixed(2));
document.documentElement.style.setProperty("--wg-running-scale", "0.2");
check("a 0.2× preference shrinks it", Math.abs(boxWidth() - 2.8) < 0.6, boxWidth().toFixed(2));
document.documentElement.style.removeProperty("--wg-running-scale");
check("dropping the preference restores 14px", Math.abs(boxWidth() - 14) < 0.6, boxWidth().toFixed(2));

const ok = results.every((result) => result.ok);
finish(ok ? "PASS" : "FAIL");
</script></body></html>`;

const argv = options(process.argv.slice(2));
const browser = argv.browser ?? BROWSERS.find((candidate) => existsSync(candidate));
if (browser === undefined) {
	console.error("card-check: no chromium binary found; pass one as the first argument");
	process.exit(2);
}
const screenshotPath = argv.screenshot === undefined ? join(PACKAGE_ROOT, "tools", "card-check.png") : argv.screenshot;

/** Resolves the in-flight browser run when the page posts its report. */
let awaitingReport = () => {};
const server = createServer((request, response) => {
	if (request.method === "POST" && request.url === "/report") {
		const chunks = [];
		request.on("data", (chunk) => chunks.push(chunk));
		request.on("end", () => {
			response.writeHead(204).end();
			awaitingReport(Buffer.concat(chunks).toString("utf8"));
		});
		return;
	}
	if (request.url === "/client.js") {
		response.writeHead(200, { "content-type": "text/javascript" }).end(readFileSync(join(PACKAGE_ROOT, "lib", "client.js")));
		return;
	}
	response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

/**
 * Run one headless browser over the check page.
 * @param args - extra browser arguments.
 * @param profileDir - the scratch profile this run owns.
 * @param waitForExit - finish when the browser exits instead of when the page
 * reports, which is what a screenshot run needs.
 * @returns the report the page posted, or an empty string when it produced none.
 */
const runBrowser = async (args, profileDir, waitForExit = false) => {
	const wait = Promise.withResolvers();
	let report = "";
	awaitingReport = (text) => {
		report = text;
		if (!waitForExit) wait.resolve();
	};
	const child = spawn(browser, [
		"--headless=new",
		"--disable-gpu",
		"--no-first-run",
		"--user-data-dir=" + profileDir,
		...args,
		origin,
	], { stdio: "ignore" });
	child.on("exit", () => wait.resolve());
	const timer = setTimeout(() => wait.resolve(), TIMEOUT_MS);
	await wait.promise;
	clearTimeout(timer);
	child.kill();
	await new Promise((resolve) => setTimeout(resolve, 600));
	return report;
};

const payload = await runBrowser(["--window-size=1200,1400"], join(PACKAGE_ROOT, "tools", ".card-check-profile"));
// A second run poses the page for the screenshot; the capture path is cleared
// first so a stale file can never stand in for a fresh one.
rmSync(screenshotPath, { force: true });
await runBrowser(
	["--window-size=1200,1400", "--virtual-time-budget=12000", "--screenshot=" + screenshotPath],
	join(PACKAGE_ROOT, "tools", ".card-check-shot-profile"),
	true,
);
server.close();
try {
	rmSync(join(PACKAGE_ROOT, "tools", ".card-check-profile"), { recursive: true, force: true });
	rmSync(join(PACKAGE_ROOT, "tools", ".card-check-shot-profile"), { recursive: true, force: true });
} catch {
	// A locked profile is harmless; the next run reuses the same directory.
}

if (payload === "") {
	console.error("card-check: the page posted no report (browser never finished?)");
	process.exit(1);
}
const { code, report } = JSON.parse(payload);
for (const line of report) console.log(line);
console.log(`\nscreenshot: ${screenshotPath}`);
console.log(`card-check: ${code}`);
process.exit(code === "PASS" ? 0 : 1);
