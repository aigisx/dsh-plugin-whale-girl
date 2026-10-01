#!/usr/bin/env node
/**
 * Inline the artwork under assets/ into the browser bundle.
 *
 * Reads src/client.template.js, substitutes the single asset placeholder with
 * the generated stylesheet plus the favicon, and writes lib/client.js — the only
 * artifact the host serves. Zero dependencies: node:fs and node:path only.
 *
 * Each distinct file is embedded exactly once: the stylesheet declares six CSS
 * custom properties under :root, and every rule reads them through var(), so a
 * source image shared by several slots costs one base64 copy rather than six.
 *
 * Artwork names, each optional except the first, and the first matching
 * extension of .svg, .png, .webp wins:
 *
 *   icon          the primary mark (hero, mark fallback)               required
 *   icon-dark     dark-theme variant of the mark
 *   icon-small    small-size variant for the 24px sidebar mark; detail that
 *                 survives at 256px turns to mush at 24px, so a zoomed or
 *                 simplified drawing reads far better there (defaults to icon)
 *   icon-small-dark  dark-theme variant of the small mark
 *   hero          conversation hero mark (defaults to icon)
 *   hero-dark     dark-theme variant of the hero mark
 *   running       thinking-status icon, shown at 14px and kept in its own
 *                 colours, because the built-in one is a blue badge
 *                 (defaults to icon). It needs no dark variant: the artwork
 *                 carries its own background.
 *   favicon       tab icon (defaults to icon; a small dedicated file keeps
 *                 the bundle from carrying the full-size mark twice)
 *
 * Every `*-dark` slot is applied through `body[data-ds-dark-theme]`, which is how
 * dsh-client-ui-theme marks the dark palette, and each falls back to its light
 * counterpart when absent.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = join(PACKAGE_ROOT, "assets");
const TEMPLATE_FILE = join(PACKAGE_ROOT, "src", "client.template.js");
const OUTPUT_FILE = join(PACKAGE_ROOT, "lib", "client.js");
const PLACEHOLDER = "__WHALE_GIRL_ASSETS__";
const EXTENSIONS = [
	[".svg", "image/svg+xml"],
	[".png", "image/png"],
	[".webp", "image/webp"],
];

/**
 * Locate one artwork file by base name.
 * @param name - base name without an extension.
 * @returns the file and its media type, or undefined.
 */
function locate(name) {
	for (const [extension, mime] of EXTENSIONS) {
		const file = join(ASSETS_DIR, name + extension);
		if (existsSync(file)) return { file, mime, name: name + extension };
	}
	return undefined;
}

/**
 * Locate the first artwork present among candidate base names.
 * @param names - candidate base names in precedence order.
 * @returns the located artwork, or undefined.
 */
function pick(names) {
	for (const name of names) {
		const found = locate(name);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * Read an artwork's height/width ratio from a PNG header or an SVG viewBox.
 * @param asset - the located artwork.
 * @returns the ratio, 1 when the source declares neither.
 */
function ratioOf(asset) {
	if (asset.mime === "image/png") {
		const bytes = readFileSync(asset.file);
		const width = bytes.readUInt32BE(16);
		const height = bytes.readUInt32BE(20);
		return width > 0 ? height / width : 1;
	}
	const text = readFileSync(asset.file, "utf8");
	const viewBox = /\bviewBox\s*=\s*["']([^"']*)["']/i.exec(text);
	if (viewBox !== null) {
		const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
		if (parts.length === 4 && parts[2] > 0) return parts[3] / parts[2];
	}
	const width = /\bwidth\s*=\s*["']([\d.]+)/i.exec(text);
	const height = /\bheight\s*=\s*["']([\d.]+)/i.exec(text);
	if (width !== null && height !== null && Number(width[1]) > 0) return Number(height[1]) / Number(width[1]);
	return 1;
}

const icon = pick(["icon"]);
if (icon === undefined) {
	console.error("build-client: assets/icon.svg (or .png/.webp) is required");
	process.exit(1);
}
const iconDark = pick(["icon-dark"]) ?? icon;
const small = pick(["icon-small"]) ?? icon;
const smallDark = pick(["icon-small-dark"]) ?? (small === icon ? iconDark : small);
const hero = pick(["hero"]) ?? icon;
const heroDark = pick(["hero-dark"]) ?? (hero === icon ? iconDark : hero);
const running = pick(["running"]) ?? icon;
const favicon = pick(["favicon"]) ?? icon;

// One base64 copy per distinct file, aliased by var() everywhere else.
const slots = [
	["--wg-mark", icon],
	["--wg-mark-dark", iconDark],
	["--wg-mark-small", small],
	["--wg-mark-small-dark", smallDark],
	["--wg-hero", hero],
	["--wg-hero-dark", heroDark],
	["--wg-running", running],
];
const declared = new Map();
const declarations = [];
for (const [property, asset] of slots) {
	const first = declared.get(asset.file);
	if (first !== undefined) {
		declarations.push(`${property}:var(${first})`);
		continue;
	}
	declared.set(asset.file, property);
	const base64 = readFileSync(asset.file).toString("base64");
	declarations.push(`${property}:url("data:${asset.mime};base64,${base64}")`);
}

const RUNNING_ICON = '[data-chat-running] [class*="_runningIcon"]';
/**
 * The application's own dark-theme marker.
 *
 * dsh-client-ui-theme switches the palette on `body[data-ds-dark-theme]`, so an
 * in-app theme choice does not necessarily match the operating system's
 * `prefers-color-scheme`. Keying the dark artwork off the media query would
 * follow the wrong signal; every dark rule hangs off this attribute instead, and
 * the light rule stays the fallback while the marker is absent.
 */
const DARK = "body[data-ds-dark-theme]";
const css = [
	`:root{${declarations.join(";")}}`,
	// Light first, dark after, and mark -> small -> hero inside each group: the hero
	// element carries both `wg-mark` and `wg-hero`, so their relative order is what
	// lets a dedicated hero asset win.
	".wg-mark{background-repeat:no-repeat;background-position:50% 50%;background-size:contain;background-image:var(--wg-mark)}",
	".wg-mark-small{background-image:var(--wg-mark-small)}",
	".wg-hero{background-image:var(--wg-hero)}",
	`${DARK} .wg-mark{background-image:var(--wg-mark-dark)}`,
	`${DARK} .wg-mark-small{background-image:var(--wg-mark-small-dark)}`,
	`${DARK} .wg-hero{background-image:var(--wg-hero-dark)}`,
	// The shipped sidebar sizes its brand box for the 24px official mark and clips
	// it: `_brandIdentity` pins its own height to 24px and `_logoRow` hides its
	// overflow, so a mark scaled past 1x is cut off top and bottom. Letting the
	// identity box follow the mark's height (its children stay centred) and letting
	// the row show the overhang keeps the shipped layout at 1x and fits every size
	// this theme offers. `_brand` keeps clipping sideways — that is what truncates
	// the wordmark in a narrow sidebar — but has to stop clipping downwards: in the
	// Windows titlebar layout the shipped `translateY(1px)` on the identity is
	// painted outside the brand box, which cost the bottom pixel of every mark,
	// official and ours alike. `clip` pairs with `visible` where `hidden` would not:
	// a hidden axis drags the visible one back to `auto` and the overhang with it.
	//
	// Each rule is anchored with `:has()` to the box that actually holds this mark,
	// because the suffix match alone would also catch an unrelated `_brand` in the
	// desktop onboarding page, and because a rebuilt hash must not matter. A renamed
	// class or a restructured tree degrades to "clipped again", never to a broken
	// sidebar.
	'[class*="_brandIdentity"]:has(> [class*="_brandMark"]){height:auto;min-height:24px}',
	'[class*="_logoRow"]:has([class*="_brandIdentity"]){overflow:visible}',
	'[class*="_brand"]:has(> [class*="_brandIdentity"]){overflow-x:clip;overflow-y:visible}',
	// The shipped running icon is an APNG mask plus a static SVG fallback; both go,
	// and the same box is repainted from our own artwork. That artwork keeps its own
	// colours — the built-in one is a blue badge — so unlike the shipped glyph it is
	// not a currentColor alpha mask, and the box needs no dark variant. Its size is
	// the shipped box times a preference the settings card writes, which is why this
	// rule restates the geometry the shipped sheet set.
	`[data-chat-running] [class*="_runningWhaleAnimated"],[data-chat-running] [class*="_runningWhaleStill"]{display:none!important}`,
	`${RUNNING_ICON}{width:calc((14px + var(--dsh-content-font-delta,0px)) * var(--wg-running-scale,1));height:calc((14px + var(--dsh-content-font-delta,0px)) * var(--wg-running-scale,1));background:var(--wg-running) 50% 50%/contain no-repeat;animation:wg-bob 1.6s ease-in-out infinite}`,
	"@keyframes wg-bob{0%,100%{transform:none}35%{transform:translateY(-1px) rotate(-4deg)}70%{transform:translateY(.5px) rotate(1.6deg)}}",
	`@media (prefers-reduced-motion:reduce){${RUNNING_ICON}{animation:none}}`,
].join("");

const assets = {
	css,
	favicon: `data:${favicon.mime};base64,${readFileSync(favicon.file).toString("base64")}`,
	faviconType: favicon.mime,
	markRatio: ratioOf(icon),
	markSmallRatio: ratioOf(small),
	heroRatio: ratioOf(hero),
};

const template = readFileSync(TEMPLATE_FILE, "utf8");
const occurrences = template.split(PLACEHOLDER).length - 1;
if (occurrences !== 1) {
	console.error(`build-client: src/client.template.js must contain ${PLACEHOLDER} exactly once, found ${occurrences}`);
	process.exit(1);
}
const output = template.replace(PLACEHOLDER, JSON.stringify(assets));
if (output.includes(PLACEHOLDER)) {
	console.error("build-client: the placeholder survived the substitution");
	process.exit(1);
}
writeFileSync(OUTPUT_FILE, output);

const unique = new Set(slots.map(([, asset]) => asset.file)).size;
console.log(`build-client: wrote ${OUTPUT_FILE} (${output.length} bytes, ${unique} embedded artwork file(s) plus the favicon)`);
for (const [label, asset] of [
	["mark", icon],
	["mark dark", iconDark],
	["mark small", small],
	["small dark", smallDark],
	["hero", hero],
	["hero dark", heroDark],
	["running", running],
	["favicon", favicon],
]) {
	console.log(`  ${label.padEnd(12)} ${asset.name} (ratio ${ratioOf(asset).toFixed(3)})`);
}
