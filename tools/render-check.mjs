#!/usr/bin/env node
/**
 * Render check: emit a page that applies the built stylesheet to a mock of the
 * shipped running-status markup, so a headless Chromium can prove the var()-driven
 * artwork resolves — the thinking icon magnified and at its real 14px, the brand
 * mark, and an unstyled control to compare against.
 *
 * Writes tools/render-check.html next to this script and prints its path.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const appended = [];
const registrations = [];
const sandbox = {
	window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
	document: {
		head: { appendChild: (element) => appended.push(element) },
		createElement: (tagName) => ({ tagName, dataset: {}, textContent: "" }),
		querySelector: () => null,
	},
	console,
};
createContext(sandbox);
runInContext(readFileSync(join(PACKAGE_ROOT, "lib", "client.js"), "utf8"), sandbox);
if (registrations.length !== 1) throw new Error("render check: the bundle registered no factory");
// The bundle is lazy CJS: the style tag is a factory-body side effect, so the
// factory has to be materialized before the stylesheet exists.
registrations[0].factory((specifier) => {
	if (specifier === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
	if (specifier === "react") return { useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(), useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}] };
	if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return {};
	throw new Error(`render check: unexpected require(${specifier})`);
});
const style = appended.find((element) => element.tagName === "style");
if (style === undefined) throw new Error("render check: the bundle appended no stylesheet");

// The mock reproduces only the geometry and layering the shipped ChatView CSS gives
// the running status, including the hash-prefixed class names the plugin selectors
// match by suffix. The plugin stylesheet under test follows it verbatim, and it owns
// the box size, so the magnified copy asks for 64px through the same multiplier the
// settings card writes (14px x 4.5714) instead of out-specifying the rule. The
// magenta diagonal is the shipped still fallback: if it shows in the screenshot, the
// swap did not happen.
const MOCK = `
html,body{margin:0;padding:0;background:transparent}
.swatch{position:absolute;top:20px;width:64px;height:64px}
#run{left:20px;--wg-running-scale:4.5714}
#run-real{left:120px;top:100px;width:14px;height:14px}
#mark{left:220px}
#empty{left:320px}
.xz4KEq_runningIcon{contain:strict;flex:none;display:inline-flex;position:relative;overflow:hidden}
.xz4KEq_runningWhaleAnimated{display:none;position:absolute;inset:0}
.xz4KEq_runningWhaleStill{display:initial}
.xz4KEq_runningWhaleStill path{stroke:rgb(255,0,255);stroke-width:6;fill:none}
`;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>${MOCK}</style><style>${style.textContent}</style></head>
<body>
  <div class="swatch" id="run" data-chat-running="true">
    <span class="xz4KEq_runningIcon">
      <span class="xz4KEq_runningWhaleAnimated"></span>
      <svg class="xz4KEq_runningWhaleStill" width="100%" height="100%" viewBox="0 0 16 16"><path d="M2 2L14 14" /></svg>
    </span>
  </div>
  <div class="swatch" id="run-real" data-chat-running="true">
    <span class="xz4KEq_runningIcon"></span>
  </div>
  <div class="swatch wg-mark" id="mark"></div>
  <div class="swatch" id="empty"></div>
</body></html>
`;

const target = join(PACKAGE_ROOT, "tools", "render-check.html");
writeFileSync(target, html);
console.log(target);
