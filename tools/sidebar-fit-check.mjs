#!/usr/bin/env node
/**
 * Fit check: does the mark the theme paints fit in the shipped sidebar row?
 *
 * The sidebar gives its brand mark a 24px box and clips its overflow, so a mark
 * scaled past 1x used to be cut off top and bottom; the theme stylesheet now
 * widens that box. This check proves the fix where it matters — in a real
 * Chromium, against the shipped stylesheet and the shipped element tree — rather
 * than against a hand-written mock of them.
 *
 * It reads the sidebar package straight out of the installed `app.asar` (its
 * stylesheet verbatim, plus the hash-prefixed class names it emits), serves
 * three sidebar mocks per column, and measures every scale from 0.5x to 2x two
 * ways: with an IntersectionObserver, whose ratio drops when an ancestor clips
 * the mark, and by hit-testing nine points across the mark's box, which only
 * land on the mark when it is really painted there.
 *
 * Two columns are measured: `before` (the shipped stylesheet with this theme's
 * fit rules stripped back out, i.e. the old behaviour) and `after` (the built
 * bundle). The check passes when nothing in `after` is clipped *and* at least
 * one case in `before` still is — a check that cannot see the bug proves
 * nothing.
 *
 * Usage:
 *   node tools/sidebar-fit-check.mjs [--browser <chromium>] [--asar <app.asar>]
 *                                    [--html <out.html>] [--screenshot <out.png>]
 */
import { createServer } from "node:http";
import { existsSync, openSync, readSync, closeSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BROWSERS = [
	"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
	"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
	"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];
const SIDEBAR_MODULE = "dsh/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js";
/** The scales the check sweeps: the whole slider range plus the old default. */
const SCALES = [0.5, 1, 1.25, 1.8, 2];
/** The scale the screenshot columns are posed at. */
const POSE_SCALE = 1.8;
const TIMEOUT_MS = 90_000;

/** Read the named options the check takes. */
function options(argv) {
	const parsed = {};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) continue;
		const [name, inline] = token.slice(2).split("=");
		parsed[name] = inline ?? argv[index + 1];
	}
	return parsed;
}

/**
 * Read one member out of an asar archive without unpacking it.
 * @param archive - path to the archive.
 * @param member - slash-separated member path.
 * @returns the member's bytes.
 */
function readArchiveMember(archive, member) {
	const fd = openSync(archive, "r");
	try {
		// u32 4 | u32 pickle payload | u32 string length | u32 json length | json | files
		const prefix = Buffer.alloc(16);
		readSync(fd, prefix, 0, 16, 0);
		const headerSize = prefix.readUInt32LE(12);
		const headerBuf = Buffer.alloc(headerSize);
		readSync(fd, headerBuf, 0, headerSize, 16);
		const header = JSON.parse(headerBuf.toString("utf8"));
		const base = 16 + headerSize;
		let node = header;
		for (const part of member.split("/")) {
			node = node.files?.[part];
			if (node === undefined) throw new Error(`asar has no member ${member}`);
		}
		const buffer = Buffer.alloc(Number(node.size));
		readSync(fd, buffer, 0, buffer.length, base + Number(node.offset));
		return buffer;
	} finally {
		closeSync(fd);
	}
}

/**
 * Pull the shipped sidebar stylesheet and its CSS-module class names out of the
 * package's client bundle.
 * @param source - the package's `lib/client.js` text.
 * @returns the stylesheet text and the local-name -> emitted-name map.
 */
function readSidebarStyles(source) {
	const literal = /const css = "((?:[^"\\]|\\.)*)";/.exec(source);
	if (literal === null) throw new Error("the sidebar bundle no longer declares its stylesheet as `const css = \"…\"`");
	const css = JSON.parse(`"${literal[1]}"`);
	const anchor = source.indexOf('"brandIdentity"');
	if (anchor === -1) throw new Error("the sidebar bundle no longer emits a brandIdentity class");
	const block = source.slice(source.lastIndexOf("= {", anchor), source.indexOf("};", anchor));
	const names = {};
	for (const [, local, emitted] of block.matchAll(/"([A-Za-z0-9_]+)":\s*"([^"]+)"/g)) names[local] = emitted;
	for (const required of ["root", "logoRow", "brand", "brandIdentity", "brandMark", "brandName", "railMark", "newSession", "wide", "collapsed", "toggle"]) {
		if (names[required] === undefined) throw new Error(`the sidebar bundle emits no ${required} class`);
	}
	return { css, names };
}

/**
 * Materialize the built browser bundle and read the stylesheet it injects.
 * @returns the injected stylesheet text.
 */
function readThemeStyles() {
	const appended = [];
	const registrations = [];
	const sandbox = {
		window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
		document: {
			head: { appendChild: (element) => appended.push(element) },
			documentElement: { style: { setProperty: () => {}, removeProperty: () => {} } },
			createElement: (tagName) => ({ tagName, dataset: {}, textContent: "" }),
			querySelector: () => null,
		},
		console,
	};
	createContext(sandbox);
	runInContext(readFileSync(join(PACKAGE_ROOT, "lib", "client.js"), "utf8"), sandbox);
	registrations[0].factory((specifier) => {
		if (specifier === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
		if (specifier === "react") return { useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(), useRef: (value) => ({ current: value }), useState: (value) => [value, () => {}] };
		if (specifier === "@deepseek-ai/dsh-client-ui-primitives") return {};
		throw new Error(`sidebar-fit-check: unexpected require(${specifier})`);
	});
	const style = appended.find((element) => element.tagName === "style");
	if (style === undefined) throw new Error("sidebar-fit-check: the bundle appended no stylesheet");
	return style.textContent;
}

/** The rules the fix adds, in the order the build emits them. */
const FIT_RULES = [
	'[class*="_brandIdentity"]:has(> [class*="_brandMark"]){height:auto;min-height:24px}',
	'[class*="_logoRow"]:has([class*="_brandIdentity"]){overflow:visible}',
	'[class*="_brand"]:has(> [class*="_brandIdentity"]){overflow-x:clip;overflow-y:visible}',
];

/**
 * Strip the theme's sidebar fit rules, so the `before` column reproduces the
 * shipped behaviour the fix replaced.
 * @param theme - the built stylesheet.
 * @returns the stylesheet and how many rules were removed.
 */
function withoutFitRules(theme) {
	let stripped = theme;
	let removed = 0;
	for (const rule of FIT_RULES) {
		if (stripped.includes(rule)) removed += 1;
		stripped = stripped.replace(rule, "");
	}
	return { css: stripped, removed };
}

/** Harness-only cosmetics: a light palette so the mock reads as a sidebar. */
const HARNESS_CSS = `
html,body{margin:0;background:transparent;font-family:"Segoe UI",system-ui,sans-serif}
:root{
  --dsw-specific-sidebar-fill:#f6f7f9;
  --dsw-alias-label-primary:#1c1d20;
  --dsw-alias-label-secondary:#6a6f78;
  --dsw-alias-label-caption:#9aa0a8;
  --dsw-alias-border-l1:#e6e8ec;--dsw-alias-border-l2:#e6e8ec;--dsw-alias-border-l3:#dcdfe4;
  --dsw-alias-button-elevated-fill:#ffffff;--dsw-alias-button-floating-hover:#f0f1f4;
  --dsw-alias-interactive-bg-hover:#ecedf0;--dsw-alias-interactive-bg-hover-solid:#e4e6ea;
  --dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-state-business-tertiary:#eef1ff;
  --dsw-radius-sm:6px;--dsw-radius-md:10px;
}
.stage{display:flex;gap:14px;padding:12px}
.mock{width:264px;border:1px solid #dcdfe4;border-radius:12px;overflow:hidden}
.mock>[class*="_root"]{height:150px}
.rail{border:none;border-radius:0;width:auto;overflow:visible}
.cap{font-size:11px;line-height:16px;color:#6a6f78;padding:6px 10px 0}
`;

/**
 * The parent page: the two posed columns, plus the numeric sweep they report.
 * @param sources - the iframe URLs for the two columns.
 * @returns the document.
 */
const parentPage = (sources) => `<!doctype html>
<html><head><meta charset="utf-8"><title>whale-girl sidebar fit check</title>
<link rel="stylesheet" href="/harness.css">
<style>
body{background:#fff;color:#1c1d20;margin:0;padding:16px 18px 0}
h1{font-size:15px;margin:0 0 2px}
p.lead{font-size:12px;color:#6a6f78;margin:0 0 12px}
.cols{display:flex;gap:22px;align-items:flex-start}
.col h2{font-size:13px;margin:0 0 8px}
.col.before h2{color:#b4232c}
.col.after h2{color:#1a7f43}
iframe{border:1px solid #dcdfe4;border-radius:10px;width:368px;height:400px;display:block}
pre{font:11px/1.5 ui-monospace,Consolas,monospace;color:#3c4048;margin:14px 0 0;white-space:pre}
</style></head>
<body>
<h1>鲸鱼娘主题：侧边栏图标显示区域验证 / sidebar mark fit check</h1>
<p class="lead">标记尺寸 ${POSE_SCALE}×，官方侧边栏样式 + 本插件的样式表；两列使用同一份元素结构，仅差修复用的两条规则。</p>
<div class="cols">
  <div class="col before"><h2>修复前（官方会裁掉超出的部分）</h2><iframe id="before" src="${sources.before}"></iframe></div>
  <div class="col after"><h2>修复后（本次改动）</h2><iframe id="after" src="${sources.after}"></iframe></div>
</div>
<pre id="table">measuring…</pre>
<script>
const SCALES = ${JSON.stringify(SCALES)};
const POSED = ${POSE_SCALE};
const reports = {};
const frames = { before: document.getElementById("before"), after: document.getElementById("after") };
const done = () => Object.keys(reports).length === 2;
const post = (payload) => fetch("/report", { method: "POST", body: JSON.stringify(payload) }).catch(() => {});
const pct = (ratio) => Math.round(ratio * 100) + "%";
const verdict = (row) => (row.ratio >= 0.999 && row.hits === row.total ? "完整" : "被裁 " + pct(1 - row.ratio));

const paint = () => {
  const lines = [];
  for (const column of ["before", "after"]) {
    lines.push((column === "before" ? "before (shipped)" : "after (this build)") + ":");
    for (const [caseId, sweep] of Object.entries(reports[column].cases)) {
      for (const row of sweep) {
        lines.push("  " + caseId.padEnd(14) + String(row.scale).padStart(5) + "x  " +
          "visible " + pct(row.ratio).padStart(5) + "  hit " + row.hits + "/" + row.total +
          "  box " + row.width.toFixed(1) + "x" + row.height.toFixed(1) + "px  " + verdict(row));
      }
    }
  }
  document.getElementById("table").textContent = lines.join("\\n");
};

window.addEventListener("message", (event) => {
  const data = event.data;
  if (data === null || typeof data !== "object" || data.kind !== "whale-girl-fit") return;
  reports[data.column] = data;
  if (!done()) return;
  paint();
  post({ kind: "whale-girl-fit", reports });
});
window.addEventListener("error", (event) => post({ kind: "whale-girl-fit-error", message: String(event.message) }));

// An iframe can finish before this listener exists, so ask for the report until
// both columns have answered instead of relying on a single announcement.
const poll = setInterval(() => {
  if (done()) { clearInterval(poll); return; }
  for (const frame of Object.values(frames)) if (frame.contentWindow !== null) frame.contentWindow.postMessage({ kind: "whale-girl-fit-poll" }, "*");
}, 200);
</script>
</body></html>`;

/**
 * The iframe document: three sidebar mocks, measured across the scale range.
 *
 * The stylesheets are inlined rather than linked so the copy this tool writes to
 * disk renders when it is opened directly, without the check's loopback server.
 *
 * @param names - the shipped sidebar class names.
 * @param column - `before` (shipped clipping) or `after` (this build).
 * @param styles - the harness, shipped sidebar, and theme stylesheets.
 * @returns the document.
 */
const mockPage = (names, column, styles) => `<!doctype html>
<html><head><meta charset="utf-8"><title>fit ${column}</title>
<style>${styles.harness}</style>
<style>${styles.sidebar}</style>
<style>${styles[column]}</style>
</head><body>
<div class="stage">
  <div class="mock" data-case="wide">
    <div class="${names.root}">
      <div class="${names.logoRow}" data-window-drag="true">
        <button type="button" class="${names.brand} ${names.wide}">
          <span class="${names.brandIdentity}" aria-hidden="true">
            <span class="${names.brandMark}"><span class="wg-mark wg-mark-small" data-mark="wide"></span></span>
            <span class="${names.brandName}"><svg width="132" height="20" viewBox="0 0 132 20" aria-hidden="true"><rect width="132" height="20" rx="4" fill="#c9ccd2"/></svg></span>
          </span>
        </button>
        <button type="button" class="${names.toggle}" aria-label="toggle"></button>
      </div>
      <button type="button" class="${names.newSession}"><span class="${names.newSessionLabelMask}"><span class="${names.newSessionContent}"><span class="${names.newSessionLabel}">新建会话</span></span></span></button>
    </div>
  </div>
  <div class="mock rail" data-case="rail">
    <div class="${names.root} ${names.collapsed}" style="height:80px">
      <div class="${names.logoRow}" data-window-drag="true">
        <button type="button" class="${names.toggle}">
          <span class="${names.railMark}" aria-hidden="true"><span class="wg-mark wg-mark-small" data-mark="rail"></span></span>
        </button>
      </div>
    </div>
  </div>
</div>
<div class="stage" data-windows-titlebar="true">
  <div class="mock" data-case="wide-titlebar">
    <div class="${names.root}">
      <div class="${names.logoRow}" data-window-drag="true">
        <button type="button" class="${names.brand} ${names.wide}">
          <span class="${names.brandIdentity}" aria-hidden="true">
            <span class="${names.brandMark}"><span class="wg-mark wg-mark-small" data-mark="wide-titlebar"></span></span>
            <span class="${names.brandName}"><svg width="132" height="20" viewBox="0 0 132 20" aria-hidden="true"><rect width="132" height="20" rx="4" fill="#c9ccd2"/></svg></span>
          </span>
        </button>
        <button type="button" class="${names.toggle}" aria-label="toggle"></button>
      </div>
    </div>
  </div>
</div>
<script>
const SCALES = ${JSON.stringify(SCALES)};
const COLUMN = ${JSON.stringify(column)};
/** The shipped slot hands the mark a 24px box; the theme multiplies it. */
const BASE = 24;
/** Nine sample points: four corners, four edge midpoints, and the centre. */
const samples = (rect) => {
  const xs = [rect.left + 1, rect.left + rect.width / 2, rect.right - 1];
  const ys = [rect.top + 1, rect.top + rect.height / 2, rect.bottom - 1];
  const points = [];
  for (const y of ys) for (const x of xs) points.push([x, y]);
  return points;
};
const area = (rect) => Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
/**
 * How much of the mark's box survives its ancestors' clipping.
 *
 * This is the same walk an IntersectionObserver does — each ancestor that hides
 * its overflow clips the mark to that ancestor's padding box — done by hand so
 * the measurement never waits on a rendering opportunity, which headless runs do
 * not reliably produce. Each axis is decided on its own, because a clip on one
 * axis with a visible other axis clips only the one, and the padding box is
 * taken from the border box minus its borders so a fractional edge is not rounded
 * away. The hit test beside it is the engine's own answer.
 */
const visibleShare = (element, rect) => {
  let visible = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    const clipsX = style.overflowX !== "visible";
    const clipsY = style.overflowY !== "visible";
    if (!clipsX && !clipsY) continue;
    const border = node.getBoundingClientRect();
    const padding = {
      left: border.left + Number.parseFloat(style.borderLeftWidth || "0"),
      top: border.top + Number.parseFloat(style.borderTopWidth || "0"),
      right: border.right - Number.parseFloat(style.borderRightWidth || "0"),
      bottom: border.bottom - Number.parseFloat(style.borderBottomWidth || "0"),
    };
    if (clipsX) {
      visible.left = Math.max(visible.left, padding.left);
      visible.right = Math.min(visible.right, padding.right);
    }
    if (clipsY) {
      visible.top = Math.max(visible.top, padding.top);
      visible.bottom = Math.min(visible.bottom, padding.bottom);
    }
  }
  const full = area(rect);
  return full === 0 ? 1 : Number((area({
    left: Math.max(rect.left, visible.left),
    top: Math.max(rect.top, visible.top),
    right: Math.min(rect.right, visible.right),
    bottom: Math.min(rect.bottom, visible.bottom),
  }) / full).toFixed(4));
};

const measure = (element, scale, identity) => {
  element.style.width = (BASE * scale) + "px";
  element.style.height = (BASE * scale) + "px";
  // Reading the rect forces the layout the new size implies, and the hit test is
  // the engine's own answer to "is this pixel of the mark really painted?".
  const rect = element.getBoundingClientRect();
  const hits = samples(rect).filter(([x, y]) => document.elementFromPoint(x, y) === element).length;
  return {
    scale,
    ratio: visibleShare(element, rect),
    hits,
    total: 9,
    width: Number(rect.width.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
    identityHeight: identity === null ? null : Number(identity.getBoundingClientRect().height.toFixed(2)),
  };
};

let result = null;
const announce = () => {
  if (result === null) return;
  parent.postMessage({ kind: "whale-girl-fit", column: COLUMN, cases: result }, "*");
};
window.addEventListener("message", (event) => {
  if (event.data?.kind === "whale-girl-fit-poll") announce();
});
window.addEventListener("error", (event) => {
  result = { failed: String(event.message) };
  announce();
});
try {
  const cases = {};
  for (const mock of document.querySelectorAll("[data-case]")) {
    const element = mock.querySelector(".wg-mark");
    const identity = mock.querySelector('[class*="_brandIdentity"]');
    cases[mock.dataset.case] = SCALES.map((scale) => measure(element, scale, identity));
  }
  result = cases;
} catch (error) {
  result = { failed: String(error && error.message) };
}
announce();
</script>
</body></html>`;

/**
 * Candidate locations of an installed application's archive: the per-user
 * install first, then the machine-wide ones, so the bare command works wherever
 * the application was installed.
 * @returns absolute paths to try, in order.
 */
function defaultAsarCandidates() {
	const roots = [
		process.env.LOCALAPPDATA === undefined ? undefined : join(process.env.LOCALAPPDATA, "Programs", "DeepSeek Harness"),
		process.env.ProgramFiles === undefined ? undefined : join(process.env.ProgramFiles, "DeepSeek Harness"),
		process.env["ProgramFiles(x86)"] === undefined ? undefined : join(process.env["ProgramFiles(x86)"], "DeepSeek Harness"),
	].filter((root) => root !== undefined);
	return roots.map((root) => join(root, "resources", "app.asar"));
}

const argv = options(process.argv.slice(2));
const candidates = defaultAsarCandidates();
const archive = argv.asar ?? candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
if (!existsSync(archive)) {
	console.error(`sidebar-fit-check: no app.asar at ${archive}; pass --asar <path>`);
	process.exit(2);
}
const sidebar = readSidebarStyles(readArchiveMember(archive, SIDEBAR_MODULE).toString("utf8"));
const theme = readThemeStyles();
const stripped = withoutFitRules(theme);
if (stripped.removed !== FIT_RULES.length) {
	console.error(`sidebar-fit-check: the built stylesheet carries ${stripped.removed} of the ${FIT_RULES.length} sidebar fit rules, ` +
		"so there is nothing meaningful to compare");
	process.exit(1);
}
console.log(`sidebar-fit-check: shipped sidebar ${sidebar.css.length} bytes, theme ${theme.length} bytes, ` +
	`${stripped.removed} fit rules removed for the before column`);

const browser = argv.browser ?? BROWSERS.find((candidate) => existsSync(candidate));
if (browser === undefined) {
	console.error("sidebar-fit-check: no chromium binary found; pass --browser <path>");
	process.exit(2);
}

const htmlPath = argv.html ?? join(PACKAGE_ROOT, "tools", "sidebar-fit-check.html");
const screenshotPath = argv.screenshot === undefined ? join(PACKAGE_ROOT, "tools", "sidebar-fit-check.png") : argv.screenshot;
const columnPath = (column) => htmlPath.replace(/\.html?$/i, "") + "." + column + ".html";
const styles = { harness: HARNESS_CSS, sidebar: sidebar.css, before: stripped.css, after: theme };
const mockBefore = mockPage(sidebar.names, "before", styles);
const mockAfter = mockPage(sidebar.names, "after", styles);

/** Resolves the in-flight browser run when the page posts its report. */
let awaitingReport = () => {};
const server = createServer((request, response) => {
	const url = new URL(request.url, "http://127.0.0.1");
	if (request.method === "POST" && url.pathname === "/report") {
		const chunks = [];
		request.on("data", (chunk) => chunks.push(chunk));
		request.on("end", () => {
			response.writeHead(204).end();
			const text = Buffer.concat(chunks).toString("utf8");
			let kind;
			try {
				kind = JSON.parse(text).kind;
			} catch {
				kind = "unparsable";
			}
			if (kind === "whale-girl-fit-error") {
				console.error(`sidebar-fit-check: the page reported an error — ${JSON.parse(text).message}`);
				return;
			}
			awaitingReport(text);
		});
		return;
	}
	const send = (type, body) => response.writeHead(200, { "content-type": type }).end(body);
	if (url.pathname === "/sidebar.css") return send("text/css", sidebar.css);
	if (url.pathname === "/plugin-after.css") return send("text/css", theme);
	if (url.pathname === "/plugin-before.css") return send("text/css", stripped.css);
	if (url.pathname === "/harness.css") return send("text/css", HARNESS_CSS);
	if (url.pathname === "/mock.html") return send("text/html; charset=utf-8", url.searchParams.get("case") === "before" ? mockBefore : mockAfter);
	return send("text/html; charset=utf-8", parentPage({ before: "/mock.html?case=before", after: "/mock.html?case=after" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

/**
 * Run one headless browser over the check page.
 * @param args - extra browser arguments.
 * @param profileDir - the scratch profile this run owns.
 * @param awaitExit - finish when the browser exits instead of when the page reports,
 * which is what a screenshot run needs: the page reports long before the capture.
 * @returns the report the page posted, or an empty string when it produced none.
 */
const runBrowser = async (args, profileDir, awaitExit = false) => {
	const wait = Promise.withResolvers();
	let report = "";
	awaitingReport = (text) => {
		report = text;
		if (!awaitExit) wait.resolve();
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

const payload = await runBrowser([], join(PACKAGE_ROOT, "tools", ".fit-check-profile"));
// A second run poses the page for the screenshot; virtual time lets a headless
// capture happen without waiting on a report round trip. It runs on its own
// profile and only after the capture path is cleared, so a stale file can never
// stand in for a fresh one.
rmSync(screenshotPath, { force: true });
await runBrowser(
	["--window-size=810,1080", "--virtual-time-budget=15000", "--screenshot=" + screenshotPath],
	join(PACKAGE_ROOT, "tools", ".fit-check-shot-profile"),
	true,
);
server.close();
try {
	rmSync(join(PACKAGE_ROOT, "tools", ".fit-check-profile"), { recursive: true, force: true });
	rmSync(join(PACKAGE_ROOT, "tools", ".fit-check-shot-profile"), { recursive: true, force: true });
} catch {
	// A locked profile is harmless; the next run reuses the same directory.
}

if (payload === "") {
	console.error("sidebar-fit-check: the page posted no report (browser never finished?)");
	process.exit(1);
}
const { reports } = JSON.parse(payload);
// The saved page is self-contained: each column is its own file with the
// stylesheets inlined, so opening the page from disk shows what the check saw.
writeFileSync(columnPath("before"), mockBefore);
writeFileSync(columnPath("after"), mockAfter);
writeFileSync(htmlPath, parentPage({
	before: columnPath("before").replace(/^.*[\\/]/, ""),
	after: columnPath("after").replace(/^.*[\\/]/, ""),
}));
if (!existsSync(screenshotPath)) console.log(`sidebar-fit-check: no screenshot at ${screenshotPath} (the browser declined)`);
for (const column of ["before", "after"]) {
	if (reports[column] === undefined || reports[column].cases === undefined) {
		console.error(`sidebar-fit-check: the ${column} column never reported; the page may not have run`);
		process.exit(1);
	}
}

const pct = (value) => `${Math.round(value * 100)}%`;
const intact = (row) => row.ratio >= 0.999 && row.hits === row.total;
let clippedBefore = 0;
let clippedAfter = 0;
let identityDrift = 0;
for (const column of ["before", "after"]) {
	console.log(`\n${column === "before" ? "before (shipped stylesheet)" : "after (this build)"}`);
	for (const [id, sweep] of Object.entries(reports[column].cases)) {
		for (const row of sweep) {
			const ok = intact(row);
			if (!ok) (column === "before" ? (clippedBefore += 1) : (clippedAfter += 1));
			if (row.scale === 1 && row.identityHeight !== null && Math.abs(row.identityHeight - 24) > 0.5) identityDrift += 1;
			console.log(
				`  ${id.padEnd(14)} ${String(row.scale).padStart(4)}x  ` +
				`visible ${pct(row.ratio).padStart(5)}  hit-test ${row.hits}/${row.total}  ` +
				`mark ${row.width.toFixed(1)}px  ${ok ? "intact" : "CLIPPED"}`,
			);
		}
	}
}
console.log(`\npage: ${htmlPath}`);
console.log(`screenshot: ${screenshotPath}`);
const pass = clippedAfter === 0 && clippedBefore > 0 && identityDrift === 0;
console.log(`\nsidebar-fit-check: ${pass ? "PASS" : "FAIL"} — clipped rows before=${clippedBefore}, after=${clippedAfter}, ` +
	`identity-height drift at 1x=${identityDrift}`);
process.exit(pass ? 0 : 1);
