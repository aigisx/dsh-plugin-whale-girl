#!/usr/bin/env node
/**
 * End-to-end check for the icon picker's image pipeline, in a real Chromium.
 *
 * The pipeline is the one piece that cannot run under Node: it needs
 * createImageBitmap, a 2D canvas, getImageData, and toDataURL("image/webp").
 * This script serves lib/client.js plus a driver page over loopback, launches a
 * headless browser at that page, and prints the report the page posts back.
 *
 * The driver materializes the bundle, applies it against a stub client context,
 * renders the settings card, hands each artwork picker a synthetic
 * white-background image, and measures what each one stored: the brand mark at
 * 256px and the thinking-status icon at 64px. It also checks that picking one
 * leaves the other alone, which is the whole point of the two being separate
 * settings.
 *
 * Usage: node tools/pipeline-check.mjs [path to a chromium binary]
 */
import { createServer } from "node:http";
import { readFileSync, rmSync } from "node:fs";
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
const TIMEOUT_MS = 60_000;

/** The driver page: everything it reports is produced by the plugin's own code. */
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>whale-girl pipeline check</title></head>
<body><pre id="out">running…</pre>
<script>
// The module facade has to exist before the bundle executes.
const report = [];
const say = (line) => report.push(line);
const post = (code) => fetch("/report", { method: "POST", body: JSON.stringify({ code, report }) }).catch(() => {});
const finish = (code) => {
  document.getElementById("out").textContent = code + "\\n" + report.join("\\n");
  post(code);
};
const jsxRuntime = { jsx: (type, props) => ({ type, props: props ?? {} }), jsxs: (type, props) => ({ type, props: props ?? {} }) };
const react = {
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  useRef: (value) => ({ current: value }),
  useState: (value) => [value, () => {}],
};
const primitives = {
  SettingsForm: function SettingsForm(props) { return { type: "SettingsForm", props }; },
  SettingsValueField: function SettingsValueField(props) { return { type: "SettingsValueField", props }; },
  settingsTextField: (field) => ({ field, format: (v) => (typeof v === "string" ? v : ""), parse: (t) => ({ kind: "set", value: t }) }),
  settingsNumberField: (field) => ({ field, format: (v) => (typeof v === "number" ? String(v) : ""), parse: (t) => ({ kind: "set", value: Number(t) }) }),
  SettingsFormModel: class {
    constructor(scope, specs) { this.scope = scope; this.specs = specs; this.staged = new Map(); }
    shell() { return { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false }; }
    field(name) { const spec = this.specs.find((s) => s.field === name); return { text: spec.format(this.scope.getSnapshot().value[name]), overridden: false, invalid: false }; }
    bind(project) { this.project = project; return { getSnapshot: () => this.project(), subscribe: () => () => {}, set: () => {} }; }
    actions() { return { edit: (f, t) => { this.staged.set(f, t); }, resetField: () => {}, save: () => {}, discard: () => {} }; }
    dispose() {}
  },
};
const registrations = [];
window.__ModuleLoader__ = { load: (registration) => registrations.push(registration) };
// Report partial progress instead of hanging the harness when a stage stops.
window.addEventListener("error", (event) => { report.push("page error: " + event.message); post("PAGE-ERROR " + event.message); });
window.addEventListener("unhandledrejection", (event) => { post("PAGE-REJECT " + String(event.reason)); });
setTimeout(() => { post("STALLED"); }, 8000);
</script>
<script src="/client.js"></script>
<script>
const registration = registrations[0];
if (registration === undefined) { say("no registration"); finish("NO-REGISTRATION"); throw new Error("no registration"); }
say("registration: " + registration.id);

const bundle = registration.factory((specifier) => {
  if (specifier === "react") return react;
  if (specifier === "react/jsx-runtime") return jsxRuntime;
  if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return primitives;
  throw new Error("unexpected require: " + specifier);
});

const captured = {};
const slots = [];
const locale = {
  dicts: new Map([["chat", new Map([["zh", { "chat.deepDiving": "深度求索中" }], ["en", {}]])]]),
  listeners: new Set(),
  register: () => () => {},
  bind: () => (key) => key,
  getLocale: () => ({ active: "zh" }),
  subscribe(fn) { locale.listeners.add(fn); return () => locale.listeners.delete(fn); },
  publish() {},
};
const ctx = {
  locale,
  configForms: { get: () => ({ getSnapshot: () => ({ status: "ready", writable: true, revision: 0, value: {} }), subscribe: () => () => {} }) },
  slots: {
    inject: (key, callback) => { slots.push(key); callback(); },
    register: (options, component) => { captured[options.name] = { options, component }; return () => {}; },
  },
  effect: (callback) => { callback(); return () => {}; },
};
bundle.apply(ctx);
say("slots: " + JSON.stringify(slots));

const card = captured["plugins.row.config"];
if (card === undefined) { say("no plugins.row.config registration"); finish("NO-CARD"); throw new Error("no card"); }
const tree = card.component({
  view: "page",
  t: (key) => key,
  useWhaleGirlTheme: (select) => select(card.options.inject().hooks.whaleGirlTheme.getSnapshot()),
  save: () => {}, discard: () => {}, resetField: () => {},
  edit: (field, text) => { captured[field] = text; },
});
say("card tree root: " + String(tree.type && tree.type.name) + ", controls: " + (tree.props.children || []).length);

const findFileInputs = (node, found) => {
  if (node === null || typeof node !== "object") return found;
  // Expand function components: the pickers are rendered as <ArtworkField/>, so
  // their own trees only exist once the components run.
  if (typeof node.type === "function") return findFileInputs(node.type(node.props), found);
  if (node.type === "input" && node.props.type === "file") { found.push(node); return found; }
  const children = node.props && node.props.children;
  const list = Array.isArray(children) ? children : children === undefined ? [] : [children];
  for (const child of list) findFileInputs(child, found);
  return found;
};
const inputs = {};
for (const node of findFileInputs(tree, [])) inputs[node.props["data-field"]] = node;
say("file inputs: " + Object.keys(inputs).join(", "));
if (inputs.icon === undefined || inputs.runningIcon === undefined) { say("the card has no picker per artwork field"); finish("NO-INPUT"); throw new Error("no input"); }
say("mark input accept=" + String(inputs.icon.props.accept));

const source = document.createElement("canvas");
source.width = 400; source.height = 300;
const sourceContext = source.getContext("2d");
sourceContext.fillStyle = "#ffffff";
sourceContext.fillRect(0, 0, 400, 300);
sourceContext.fillStyle = "#2f6bd8";
sourceContext.beginPath();
sourceContext.arc(200, 150, 100, 0, Math.PI * 2);
sourceContext.fill();
say("source: 400x300 white page, #2f6bd8 disc r=100");

const measure = (dataUri) => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => {
    const probe = document.createElement("canvas");
    probe.width = image.width; probe.height = image.height;
    const probeContext = probe.getContext("2d");
    probeContext.drawImage(image, 0, 0);
    const data = probeContext.getImageData(0, 0, image.width, image.height).data;
    let opaque = 0, transparent = 0, white = 0, sumR = 0, sumG = 0, sumB = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200) {
        opaque += 1; sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
        if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white += 1;
      }
      else if (data[i + 3] < 8) transparent += 1;
    }
    const total = data.length / 4;
    resolve({ type: dataUri.slice(5, dataUri.indexOf(";")), chars: dataUri.length, width: image.width, height: image.height,
      opaqueShare: Number((opaque / total).toFixed(3)), transparentShare: Number((transparent / total).toFixed(3)),
      whiteShare: Number((white / total).toFixed(3)),
      mean: opaque === 0 ? null : [Math.round(sumR / opaque), Math.round(sumG / opaque), Math.round(sumB / opaque)] });
  };
  image.onerror = () => resolve({ error: "decode failed" });
  image.src = dataUri;
});

/** Hand one picker a file and wait for the staged edit it eventually reports. */
const pick = async (node, file, field) => {
  delete captured[field];
  try { await node.props.onChange({ target: { files: [file], value: "" } }); }
  catch (error) { say(field + " onChange threw: " + String(error && error.message)); }
  // The change handler kicks off an async pipeline and returns immediately.
  for (let attempt = 0; attempt < 200 && !captured[field]; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return captured[field] || "";
};

source.toBlob(async (blob) => {
  const file = new File([blob], "picked.png", { type: "image/png" });

  const mark = await pick(inputs.icon, file, "icon");
  if (mark === "") { say("no mark artwork captured"); finish("NO-ICON"); return; }
  const markInfo = await measure(mark);
  say("mark (256):    " + JSON.stringify(markInfo));
  const afterMark = { icon: mark, runningIcon: captured.runningIcon };
  say("staged settings after the mark pick: " + JSON.stringify(["icon", "runningIcon"].filter((field) => captured[field] !== undefined)));
  if (captured.runningIcon !== undefined) { say("the mark picker also staged the thinking icon"); finish("NOT-INDEPENDENT"); return; }

  const glyph = await pick(inputs.runningIcon, file, "runningIcon");
  if (glyph === "") { say("no thinking artwork captured"); finish("NO-GLYPH"); return; }
  const glyphInfo = await measure(glyph);
  say("thinking (64): " + JSON.stringify(glyphInfo));
  if (captured.icon !== afterMark.icon) { say("the thinking picker overwrote the mark"); finish("NOT-INDEPENDENT"); return; }

  // Regression: artwork drawn in the page's own colour must survive the keying.
  // A white page with a navy ring on it used to come back hollow, because the
  // blend-ring pass faded every pixel that merely resembled the page colour.
  const ring = document.createElement("canvas");
  ring.width = 400; ring.height = 300;
  const ringContext = ring.getContext("2d");
  ringContext.fillStyle = "#ffffff";
  ringContext.fillRect(0, 0, 400, 300);
  ringContext.strokeStyle = "#123a6b";
  ringContext.lineWidth = 30;
  ringContext.beginPath();
  ringContext.arc(200, 150, 85, 0, Math.PI * 2);
  ringContext.stroke();
  say("source: 400x300 white page, #123a6b ring r=85 w=30 (white inside)");
  const ringBlob = await new Promise((resolve) => ring.toBlob(resolve, "image/png"));
  const ringIcon = await pick(inputs.runningIcon, new File([ringBlob], "ring.png", { type: "image/png" }), "runningIcon");
  if (ringIcon === "") { say("no artwork captured for the ring"); finish("NO-RING"); return; }
  const ringInfo = await measure(ringIcon);
  say("ring interior (64): " + JSON.stringify(ringInfo));

  const ok = markInfo.width === 256 && markInfo.height === 256 && markInfo.type === "image/webp"
    && markInfo.transparentShare > 0.3 && markInfo.opaqueShare > 0.05
    && glyphInfo.width === 64 && glyphInfo.height === 64 && glyphInfo.type === "image/webp"
    && glyphInfo.transparentShare > 0.3 && glyphInfo.opaqueShare > 0.05
    && ringInfo.whiteShare > 0.3 && ringInfo.transparentShare > 0.05;
  finish(ok ? "PASS" : "FAIL");
}, "image/png");
</script></body></html>`;

const browser = process.argv[2] ?? BROWSERS.find((candidate) => {
	try {
		readFileSync(candidate);
		return true;
	} catch {
		return false;
	}
});
if (browser === undefined) {
	console.error("pipeline-check: no chromium binary found; pass one as the first argument");
	process.exit(2);
}

const settle = Promise.withResolvers();
const server = createServer((request, response) => {
	if (request.method === "POST" && request.url === "/report") {
		const chunks = [];
		request.on("data", (chunk) => chunks.push(chunk));
		request.on("end", () => {
			response.writeHead(204).end();
			settle.resolve(Buffer.concat(chunks).toString("utf8"));
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
const profile = join(PACKAGE_ROOT, "tools", ".pipeline-profile");
const child = spawn(browser, [
	"--headless=new",
	"--disable-gpu",
	"--no-first-run",
	"--user-data-dir=" + profile,
	"--virtual-time-budget=20000",
	origin,
], { stdio: "ignore" });

const timer = setTimeout(() => settle.resolve(""), TIMEOUT_MS);
const payload = await settle.promise;
clearTimeout(timer);
child.kill();
server.close();
// Best effort: the browser may still hold its profile for a moment after the
// kill, and a leftover scratch directory must not fail the check.
await new Promise((resolve) => setTimeout(resolve, 500));
try {
	rmSync(profile, { recursive: true, force: true });
} catch {
	// A locked profile is harmless; the next run reuses the same directory.
}

if (payload === "") {
	console.error("pipeline-check: the page posted no report (browser never finished?)");
	process.exit(1);
}
const { code, report } = JSON.parse(payload);
for (const line of report) console.log(`  ${line}`);
console.log(`\npipeline-check: ${code}`);
process.exit(code === "PASS" ? 0 : 1);
