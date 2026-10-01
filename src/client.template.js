/**
 * Whale-girl theme, browser half — source template.
 *
 * tools/build-client.mjs substitutes the single asset placeholder with the
 * generated artwork stylesheet and writes the result to lib/client.js. Do not
 * edit lib/client.js by hand: swap the files under assets/ and re-run the build.
 *
 * The bundle is lazy CJS: executing the script only registers the factory, and
 * every side effect (style tag, favicon link) runs when the factory is first
 * materialized, so nothing happens until the plugin is actually used.
 *
 * Three surfaces live here:
 *
 * 1. the theme itself — two shadowed brand slots, a repainted running glyph, the
 *    favicon, and the zh running copy;
 * 2. the `whale-girl` settings namespace, read through `ctx.configForms` so a
 *    preference written on one browser reaches every open page;
 * 3. the settings card, registered both on the plugin's row in the Plugins page
 *    and as a page of its own on the Settings panel.
 */
window.__ModuleLoader__.load({
	id: "dsh-plugin-whale-girl",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const react_jsx_runtime = require("react/jsx-runtime");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const jsx = react_jsx_runtime.jsx;
		const jsxs = react_jsx_runtime.jsxs;

		/** This package's name: the browser module id and the style-tag owner. */
		const PLUGIN_ID = "dsh-plugin-whale-girl";
		/** Loader row id, which is also the settings namespace the host serves for it. */
		const CONFIG_NS = "whale-girl";
		/** `plugins.row.config` cell for this bundle's own row. */
		const ROW_CONFIG_KEY = PLUGIN_ID + "#" + CONFIG_NS;
		/** Section id on the Settings panel. */
		const SETTINGS_SECTION_ID = "whale-girl-theme";
		/** Dictionary namespace owned by this plugin. */
		const NS = "whaleGirlTheme";
		/** Scale the brand marks use when the preference is absent: the built-in marks read small. */
		const DEFAULT_SCALE = 1.8;
		/** Scale the thinking-state icon uses when the preference is absent: the shipped 14px box. */
		const DEFAULT_RUNNING_SCALE = 1;
		/** Slider bounds shared by both size preferences, so a stored value cannot hide a mark or cover the layout. */
		const SCALE_MIN = 0.2;
		const SCALE_MAX = 3;
		/** Slider granularity: a stored preference is snapped to this grid. */
		const SCALE_STEP = 0.2;
		/** Decimals implied by {@link SCALE_STEP}, used to snap a value and to render the readout. */
		const SCALE_DECIMALS = 1;
		/** Copy the zh running text falls back to when the preference is absent or blank. */
		const DEFAULT_RUNNING_TEXT = "努力干饭中";
		/** Suffix the running text gains once a turn has a start time. */
		const RUNNING_DURATION_SUFFIX = "，用时 {duration} ···";
		/** Longest source edge the picker renders before trimming, in device pixels. */
		const WORK_EDGE = 512;
		/** Edge of the stored icon, in pixels. */
		const ICON_EDGE = 256;
		/** Edge of the stored thinking-status icon, in pixels. */
		const RUNNING_EDGE = 64;

		//#region artwork
		/**
		 * Build-injected artwork: the generated stylesheet (one base64 copy per
		 * distinct source file, aliased through CSS custom properties) plus the
		 * favicon and the source aspect ratios.
		 */
		const ASSETS = __WHALE_GIRL_ASSETS__;
		//#endregion

		//#region copy
		/** English copy for the settings card. */
		const en = {
			title: "Whale-girl theme",
			summaryIcon: "Icon",
			summaryRunningIcon: "Thinking icon",
			summaryBuiltIn: "built-in",
			summaryCustom: "custom",
			summaryRunningText: "Running copy",
			summaryScale: "Mark size",
			summaryRunningScale: "Thinking size",
			groupIcon: "Icon",
			groupRunning: "Thinking",
			icon: "Icon",
			iconHint: "PNG, SVG, WebP or JPEG. A flat background is keyed out automatically, and the artwork is centred and scaled to 256 px before it is stored.",
			iconBuiltIn: "Built-in",
			runningIcon: "Thinking icon",
			runningIconHint: "The 14 px mark that precedes the running copy (the built-in one is a blue bowl of millet with chopsticks). Independent of the icon above; stored at 64 px with its own colours.",
			runningIconBuiltIn: "Built-in",
			iconChoose: "Choose image…",
			iconWorking: "Processing…",
			iconClear: "Use built-in",
			iconFailed: "That image could not be read.",
			artworkUnkeyed: "The picture has no flat background to remove, so it keeps its own background.",
			runningText: "Running copy",
			runningTextHint: "Shown beside the thinking-status icon in Chinese, for example 努力干饭中. Leave blank for the theme default.",
			iconScale: "Icon size",
			iconScaleHint: "Multiplier for the sidebar and new-session marks, 0.2× to 3× in steps of 0.2× (default 1.8×).",
			iconScaleSliderLabel: "Icon size multiplier",
			runningScale: "Icon size",
			runningScaleHint: "Multiplier for the thinking-status box itself, 0.2× to 3× in steps of 0.2× (default 1×, the shipped 14 px).",
			runningScaleSliderLabel: "Thinking icon size multiplier",
			overridden: "Overridden",
			reset: "Reset to default",
			invalidNumber: "Enter a number, or leave blank to use the default.",
			readOnly: "This deployment stores settings read-only.",
			unavailable: "The host is not serving this plugin's settings right now.",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The deployment did not accept these values; they were left for you to correct."
		};
		/** Simplified Chinese copy for the settings card. */
		const zh = {
			title: "鲸鱼娘主题",
			summaryIcon: "图标",
			summaryRunningIcon: "思考中图标",
			summaryBuiltIn: "内置",
			summaryCustom: "自定义",
			summaryRunningText: "思考中文案",
			summaryScale: "图标大小",
			summaryRunningScale: "思考中大小",
			groupIcon: "图标",
			groupRunning: "思考中",
			icon: "图标",
			iconHint: "支持 PNG / SVG / WebP / JPEG。纯色背景会自动抠掉，图片会居中裁切并缩放到 256px 后再保存。",
			iconBuiltIn: "内置图标",
			runningIcon: "思考中图标",
			runningIconHint: "「努力干饭中」前面的那个小图标，官方的显示尺寸是 14px（内置是蓝底小米饭配筷子）。与上面的图标互不影响；单独选择，按 64px 保留原色保存。",
			runningIconBuiltIn: "内置小碗",
			iconChoose: "选择图片…",
			iconWorking: "处理中…",
			iconClear: "恢复内置",
			iconFailed: "这张图片读取失败。",
			artworkUnkeyed: "这张图没有可抠的纯色背景，会连同它自己的背景一起使用。",
			runningText: "思考中文案",
			runningTextHint: "显示在「思考中」图标旁边的中文，例如 努力干饭中。留空表示使用主题默认值。",
			iconScale: "图标大小",
			iconScaleHint: "侧边栏与新会话首页图标的放大倍数，0.2×–3×，每档 0.2×（默认 1.8×）。",
			iconScaleSliderLabel: "图标放大倍数",
			runningScale: "图标大小",
			runningScaleHint: "「思考中」那个小图标本身的放大倍数，0.2×–3×，每档 0.2×（默认 1×，即官方的 14px）。",
			runningScaleSliderLabel: "思考中图标放大倍数",
			overridden: "已覆盖",
			reset: "恢复默认",
			invalidNumber: "请填数字；留空表示使用默认值。",
			readOnly: "本部署的设置为只读。",
			unavailable: "宿主当前没有提供本插件的设置。",
			save: "保存",
			saving: "保存中…",
			saveFailed: "本部署没有接受这些值，已保留供你修改。"
		};
		//#endregion

		//#region styles
		/** Card chrome, appended to the generated artwork stylesheet. */
		const CARD_CSS = [
			// Two groups, side by side when the panel is wide enough for them and stacked
			// when it is not: the brand mark and the thinking state are set independently,
			// and reading them as one list hid that.
			".wg-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;align-items:start}",
			".wg-group{display:flex;flex-direction:column;min-width:0;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px 16px}",
			".wg-group-title{margin:0;padding:0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}",
			".wg-group-title+.wg-field{border-top:none;padding-top:8px}",
			".wg-group .wg-field:last-child{padding-bottom:0}",
			".wg-field{display:flex;flex-direction:column;gap:8px;padding:16px 0;border-top:1px solid var(--dsw-alias-border-l1)}",
			".wg-field:first-child{border-top:none;padding-top:0}",
			".wg-field-head{display:flex;align-items:center;justify-content:space-between;gap:12px}",
			".wg-field-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".wg-field-badges{display:flex;align-items:center;gap:8px}",
			".wg-field-tag{font-size:11px;line-height:16px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-secondary)}",
			".wg-field-reset{border:none;background:none;padding:0;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}",
			".wg-field-reset:disabled{opacity:.5;cursor:default}",
			".wg-hint{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);margin:0}",
			".wg-error{font-size:12px;line-height:1.6;color:var(--dsw-alias-state-error-primary);margin:0}",
			".wg-image{display:flex;align-items:center;gap:16px}",
			".wg-image-preview{width:64px;height:64px;box-sizing:border-box;flex:none;object-fit:contain;border-radius:10px;padding:6px;background:var(--dsw-alias-interactive-bg-hover-solid)}",
			".wg-image-empty{width:64px;height:64px;box-sizing:border-box;flex:none;display:flex;align-items:center;justify-content:center;border-radius:10px;border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font-size:11px;text-align:center;line-height:1.3;padding:4px}",
			".wg-image-actions{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0}",
			".wg-button{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-solid)}",
			".wg-button:disabled{opacity:.5;cursor:default}",
			".wg-scale{display:flex;align-items:center;gap:12px}",
			".wg-scale-input{flex:1;min-width:0;height:20px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-state-business-primary)}",
			".wg-scale-input:disabled{cursor:default;opacity:.5}",
			".wg-scale-readout{flex:none;min-width:48px;text-align:right;font-size:13px;line-height:20px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}",
			".wg-summary{font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}",
		].join("");
		const STYLE_TAG_ID = PLUGIN_ID + "/whale-girl.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = PLUGIN_ID;
			tag.dataset.pluginCss = STYLE_TAG_ID;
			tag.textContent = ASSETS.css + CARD_CSS;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region favicon
		// Appended, never replacing the shipped links, so unloading this plugin
		// leaves the document one reload away from the official icon.
		if (typeof document !== "undefined" && document.querySelector('link[data-plugin="' + PLUGIN_ID + '"]') === null) {
			const link = document.createElement("link");
			link.rel = "icon";
			link.type = ASSETS.faviconType;
			link.href = ASSETS.favicon;
			link.dataset.plugin = PLUGIN_ID;
			document.head.appendChild(link);
		}
		//#endregion

		//#region theme state
		/** Artwork slots a custom icon replaces; the whole set moves together. */
		const ARTWORK_VARIABLES = ["--wg-mark", "--wg-mark-small", "--wg-hero", "--wg-mark-dark", "--wg-mark-small-dark", "--wg-hero-dark"];
		/** Artwork slot the thinking-status icon replaces. */
		const GLYPH_VARIABLES = ["--wg-running"];
		/** Custom property the thinking-state box reads its multiplier from. */
		const RUNNING_SCALE_VARIABLE = "--wg-running-scale";
		/** The applied preferences, as an immutable snapshot the marks subscribe to. */
		let theme = Object.freeze({ icon: "", runningIcon: "", runningText: "", scale: DEFAULT_SCALE, runningScale: DEFAULT_RUNNING_SCALE });
		const themeListeners = new Set();

		/**
		 * Read the theme snapshot.
		 * @returns the current snapshot, stable until a preference changes.
		 */
		function readTheme() {
			return theme;
		}

		/**
		 * Subscribe to theme changes, in the shape `useSyncExternalStore` wants.
		 * @param listener - callback invoked after every change.
		 * @returns unsubscribe.
		 */
		function watchTheme(listener) {
			themeListeners.add(listener);
			return () => {
				themeListeners.delete(listener);
			};
		}

		/**
		 * Whether a stored preference is a data URI this theme can paint.
		 * @param value - the raw preference.
		 * @returns whether it is usable artwork.
		 */
		function isArtwork(value) {
			return typeof value === "string" && value.startsWith("data:image/");
		}

		/**
		 * Put any number on the slider's grid and inside its bounds.
		 *
		 * A preference stored before this range existed (or typed into an older
		 * build) can be off-grid or out of range; snapping here means the slider's
		 * readout always reports the multiplier a surface is actually painted at.
		 *
		 * @param value - the raw multiplier, or anything else.
		 * @param fallback - the multiplier to use when the raw value is not a number.
		 * @returns the multiplier to apply.
		 */
		function snapScale(value, fallback) {
			const steps = Math.round(1 / SCALE_STEP);
			const bounded = Number.isFinite(value) ? value : fallback;
			const snapped = Math.round(bounded * steps) / steps;
			const rounded = Number(snapped.toFixed(SCALE_DECIMALS));
			return Math.min(SCALE_MAX, Math.max(SCALE_MIN, rounded));
		}

		/**
		 * Read the multiplier a field's staged text stands for.
		 * @param text - the field's draft text.
		 * @param fallback - the multiplier a blank or unparsable draft stands for.
		 * @returns the multiplier to show on the slider.
		 */
		function scaleFromText(text, fallback) {
			const parsed = Number.parseFloat(text);
			return snapScale(parsed, fallback);
		}

		/**
		 * Render a multiplier the way the settings card shows it.
		 * @param value - the multiplier.
		 * @returns the readout text.
		 */
		function scaleText(value) {
			return value.toFixed(SCALE_DECIMALS) + "×";
		}

		/**
		 * Apply one settings snapshot: paint the overrides as inline custom properties.
		 *
		 * The generated stylesheet declares the built-in artwork on `:root`; an inline
		 * property on the same element outranks it, and removing the property restores
		 * the built-in without touching the sheet.
		 *
		 * @param value - the namespace's resolved value.
		 * @returns the next theme snapshot.
		 */
		function adoptSettings(value) {
			const settings = value === null || typeof value !== "object" ? {} : value;
			const icon = isArtwork(settings.icon) ? settings.icon : "";
			const runningIcon = isArtwork(settings.runningIcon) ? settings.runningIcon : "";
			const runningText = typeof settings.runningText === "string" ? settings.runningText.trim() : "";
			const scale = snapScale(settings.iconScale, DEFAULT_SCALE);
			const runningScale = snapScale(settings.runningScale, DEFAULT_RUNNING_SCALE);
			if (typeof document !== "undefined") {
				const root = document.documentElement.style;
				for (const property of ARTWORK_VARIABLES) {
					if (icon === "") root.removeProperty(property);
					else root.setProperty(property, 'url("' + icon + '")');
				}
				for (const property of GLYPH_VARIABLES) {
					if (runningIcon === "") root.removeProperty(property);
					else root.setProperty(property, 'url("' + runningIcon + '")');
				}
				// The shipped box is the fallback, so an absent preference simply drops
				// the property and the stylesheet's own `var(…,1)` takes over.
				if (settings.runningScale === undefined) root.removeProperty(RUNNING_SCALE_VARIABLE);
				else root.setProperty(RUNNING_SCALE_VARIABLE, String(runningScale));
			}
			theme = Object.freeze({ icon, runningIcon, runningText, scale, runningScale });
			for (const listener of [...themeListeners]) {
				try {
					listener();
				} catch (error) {
					console.error(PLUGIN_ID + ": theme listener crashed", error);
				}
			}
			return theme;
		}
		//#endregion

		//#region brand marks
		/**
		 * Render the whale-girl mark in the box the host surface asked for.
		 *
		 * The host className is kept on the element: the hero passes its own `.fish`
		 * class, which carries the layout box and the hover swim animation, and the
		 * sidebar passes only a size. The size multiplier comes from the theme
		 * preference, so both marks follow one number.
		 *
		 * @param props - host-requested size, host className, artwork ratio and variant class.
		 * @returns the mark element.
		 */
		function WhaleGirlMark({ size = 24, className, ratio = ASSETS.markRatio, variant }) {
			const current = react.useSyncExternalStore(watchTheme, readTheme);
			const scaled = Math.round(size * current.scale * 100) / 100;
			const classes = ["wg-mark", variant, className === undefined ? "" : className].filter(Boolean).join(" ");
			return jsx("span", {
				className: classes,
				style: {
					width: scaled,
					height: Math.round(scaled * ratio * 100) / 100,
					display: "inline-block",
					flex: "none",
					verticalAlign: "middle"
				},
				"aria-hidden": "true"
			});
		}

		/**
		 * Sidebar brand mark occupant.
		 *
		 * Uses the small-size artwork when one is supplied: at 24px the detail that
		 * reads well at hero size collapses into a smudge, so a zoomed or simplified
		 * drawing is worth its own asset.
		 *
		 * @param props - host-supplied size.
		 * @returns the whale-girl mark.
		 */
		function WhaleGirlBrandMark({ size = 24 }) {
			return WhaleGirlMark({ size, ratio: ASSETS.markSmallRatio, variant: "wg-mark-small" });
		}

		/**
		 * Conversation hero brand mark occupant.
		 * @param props - host-supplied size and the hero's own class.
		 * @returns the whale-girl hero mark.
		 */
		function WhaleGirlHeroMark({ size = 34, className }) {
			return WhaleGirlMark({ size, className, ratio: ASSETS.heroRatio, variant: "wg-hero" });
		}
		//#endregion

		//#region running copy
		/** Namespace owned by the chat client plugin whose running copy this theme rewrites. */
		const CHAT_NS = "chat";
		/** Placeholder marking a key this theme added that the shipped dictionary did not have. */
		const ABSENT = Symbol("absent");

		/**
		 * The replacement copy for the current preference.
		 * @param current - the theme snapshot.
		 * @returns the zh message keys and their replacements.
		 */
		function runningCopy(current) {
			const text = current.runningText === "" ? DEFAULT_RUNNING_TEXT : current.runningText;
			const copy = {};
			copy["chat.deepDiving"] = text;
			copy["chat.deepDivingFor"] = text + RUNNING_DURATION_SUFFIX;
			return copy;
		}

		/**
		 * Read one namespace's per-language dictionary map off the locale runtime.
		 *
		 * Duck-typed on purpose: a Map from another realm still answers `get`, and so
		 * does any future registry that keeps the Map contract, while an unrelated
		 * object without `get` is refused instead of being mutated.
		 *
		 * @param locale - the locale service.
		 * @param namespace - dictionary namespace to read.
		 * @returns the language map, or undefined when the runtime exposes no such registry.
		 */
		function languageMap(locale, namespace) {
			const dicts = locale === undefined || locale === null ? undefined : locale.dicts;
			if (dicts === undefined || dicts === null || typeof dicts.get !== "function") return undefined;
			const byLanguage = dicts.get(namespace);
			if (byLanguage === undefined || byLanguage === null || typeof byLanguage.get !== "function") return undefined;
			return byLanguage;
		}

		/**
		 * Replace the chat plugin's zh running copy in place.
		 *
		 * Every access is guarded: a locale runtime that no longer exposes the same
		 * dictionary shape leaves the shipped copy untouched instead of failing the
		 * plugin. The two keys are also the ones the shipped accessible status region
		 * announces, so the rewrite covers sighted and screen-reader copy at once.
		 *
		 * @param locale - the locale service.
		 * @param displaced - collector for the values this call replaced.
		 * @param copy - the replacements to write.
		 * @returns whether anything changed.
		 */
		function rewriteRunningCopy(locale, displaced, copy) {
			const byLanguage = languageMap(locale, CHAT_NS);
			if (byLanguage === undefined) return false;
			const entries = byLanguage.get("zh");
			if (entries === null || typeof entries !== "object") return false;
			if (!Object.keys(copy).some((key) => key in entries)) return false;
			let changed = false;
			for (const key of Object.keys(copy)) {
				const next = copy[key];
				if (entries[key] === next) continue;
				if (!displaced.has(key)) displaced.set(key, key in entries ? entries[key] : ABSENT);
				entries[key] = next;
				changed = true;
			}
			return changed;
		}

		/**
		 * Restore whatever {@link rewriteRunningCopy} displaced.
		 * @param locale - the locale service.
		 * @param displaced - the values collected by the rewrite.
		 */
		function restoreRunningCopy(locale, displaced) {
			const byLanguage = languageMap(locale, CHAT_NS);
			if (byLanguage === undefined) return;
			const entries = byLanguage.get("zh");
			if (entries === null || typeof entries !== "object") return;
			for (const [key, value] of displaced) {
				if (value === ABSENT) delete entries[key];
				else entries[key] = value;
			}
			displaced.clear();
		}
		//#endregion

		//#region picked artwork
		/**
		 * Read a picked file into a bitmap at the working size.
		 * @param file - the picked image file.
		 * @returns the working canvas and its context.
		 */
		async function readPickedImage(file) {
			const bitmap = await createImageBitmap(file);
			const longest = Math.max(bitmap.width, bitmap.height);
			const factor = Math.min(1, WORK_EDGE / longest);
			const width = Math.max(1, Math.round(bitmap.width * factor));
			const height = Math.max(1, Math.round(bitmap.height * factor));
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext("2d", { willReadFrequently: true });
			context.drawImage(bitmap, 0, 0, width, height);
			if (typeof bitmap.close === "function") bitmap.close();
			return { canvas, context, width, height };
		}

		/**
		 * Remove a flat, border-connected background and fade the blend ring.
		 *
		 * The page colour is read from the four corners and only keyed when they agree;
		 * a picture without a flat background is left alone rather than half-erased.
		 * Pixels the flood fill cannot reach stay opaque, so white detail inside the
		 * artwork survives.
		 *
		 * The blend ring — the anti-aliased edge that still carries the page colour —
		 * is faded only where it *meets* the removed background. Fading every pixel
		 * that merely resembles the page colour used to hollow out artwork drawn in
		 * that same colour: a white bowl of rice on a white page came back as an
		 * outline, because 53k pixels deep inside the drawing were faded along with
		 * the 1.7k that actually sat on the edge.
		 *
		 * @param image - the working-size image data, mutated in place.
		 * @param width - image width.
		 * @param height - image height.
		 * @returns the artwork bounds, or undefined when nothing was keyed.
		 */
		function keyFlatBackground(image, width, height) {
			const pixels = image.data;
			const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
			const base = [0, 0, 0];
			for (const [x, y] of corners) {
				const at = (y * width + x) * 4;
				for (let channel = 0; channel < 3; channel++) base[channel] += pixels[at + channel] / corners.length;
			}
			for (const [x, y] of corners) {
				const at = (y * width + x) * 4;
				for (let channel = 0; channel < 3; channel++) if (Math.abs(pixels[at + channel] - base[channel]) > 24) return undefined;
			}
			const tolerance = 30;
			const span = tolerance * 2;
			const isPageColour = (at) => pixels[at + 3] > 8
				&& Math.abs(pixels[at] - base[0]) <= tolerance
				&& Math.abs(pixels[at + 1] - base[1]) <= tolerance
				&& Math.abs(pixels[at + 2] - base[2]) <= tolerance;
			const seen = new Uint8Array(width * height);
			const stack = [];
			for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
			for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
			let cleared = 0;
			while (stack.length > 0) {
				const at = stack.pop();
				if (seen[at] === 1) continue;
				const offset = at * 4;
				if (!isPageColour(offset)) continue;
				seen[at] = 1;
				pixels[offset + 3] = 0;
				cleared += 1;
				const x = at % width;
				const y = (at - x) / width;
				if (x > 0) stack.push(at - 1);
				if (x < width - 1) stack.push(at + 1);
				if (y > 0) stack.push(at - width);
				if (y < height - 1) stack.push(at + width);
			}
			if (cleared < width * height * 0.05) return undefined;

			/**
			 * Whether a pixel is artwork: not part of the removed background, and not
			 * already transparent in the source.
			 * @param at - pixel index.
			 * @returns whether the pixel survived the fill.
			 */
			const isArtwork = (at) => seen[at] === 0 && pixels[at * 4 + 3] > 8;

			// A background pattern — a transparency checkerboard, a paper texture — leaves
			// specks of near-page colour that the fill cannot reach because an edge pixel
			// shaded the wrong way interrupts it. Nothing that small can be artwork, so it
			// goes; that also keeps the specks out of the crop bounds below.
			const speckLimit = Math.max(8, Math.round(width * height * 0.001));
			const labelled = new Uint8Array(width * height);
			for (let start = 0; start < width * height; start++) {
				if (labelled[start] === 1 || !isArtwork(start)) continue;
				const component = [];
				const queue = [start];
				labelled[start] = 1;
				while (queue.length > 0) {
					const at = queue.pop();
					component.push(at);
					const x = at % width;
					const y = (at - x) / width;
					if (x > 0 && labelled[at - 1] === 0 && isArtwork(at - 1)) {
						labelled[at - 1] = 1;
						queue.push(at - 1);
					}
					if (x < width - 1 && labelled[at + 1] === 0 && isArtwork(at + 1)) {
						labelled[at + 1] = 1;
						queue.push(at + 1);
					}
					if (y > 0 && labelled[at - width] === 0 && isArtwork(at - width)) {
						labelled[at - width] = 1;
						queue.push(at - width);
					}
					if (y < height - 1 && labelled[at + width] === 0 && isArtwork(at + width)) {
						labelled[at + width] = 1;
						queue.push(at + width);
					}
				}
				if (component.length >= speckLimit) continue;
				for (const at of component) pixels[at * 4 + 3] = 0;
			}

			/**
			 * Whether a pixel sits against the removed background, which is what makes a
			 * page-coloured pixel part of the anti-aliased edge rather than artwork.
			 * @param x - pixel column.
			 * @param y - pixel row.
			 * @returns whether any of the eight neighbours was keyed out.
			 */
			const meetsBackground = (x, y) => {
				for (let dy = -1; dy <= 1; dy++) {
					const ny = y + dy;
					if (ny < 0 || ny >= height) continue;
					for (let dx = -1; dx <= 1; dx++) {
						const nx = x + dx;
						if (nx < 0 || nx >= width) continue;
						if (!isArtwork(ny * width + nx)) return true;
					}
				}
				return false;
			};

			let minX = width;
			let minY = height;
			let maxX = -1;
			let maxY = -1;
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const offset = (y * width + x) * 4;
					if (pixels[offset + 3] <= 8) continue;
					// Blend ring: a pixel on the edge of the remaining artwork that still
					// carries the page colour takes a partial alpha proportional to how far
					// it moved away, so the mark does not keep a pale outline on a dark
					// surface. Pixels of the same colour further inside are artwork.
					if (meetsBackground(x, y)) {
						const distance = Math.max(
							Math.abs(pixels[offset] - base[0]),
							Math.abs(pixels[offset + 1] - base[1]),
							Math.abs(pixels[offset + 2] - base[2])
						);
						if (distance < span) pixels[offset + 3] = Math.round(255 * Math.min(1, distance / span));
					}
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}
			}
			if (maxX < 0) return undefined;
			return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
		}

		/**
		 * Turn a picked file into one stored data URI.
		 *
		 * The picture is keyed, trimmed to the artwork, centred on a square with a
		 * small margin, and scaled to the edge its slot is stored at — 256px for the
		 * brand mark, 64px for the 14px thinking-status icon. Colours are kept: both
		 * slots are artwork in their own right (the built-in thinking icon is a blue
		 * badge), so nothing is flattened into a tinted silhouette.
		 *
		 * @param file - the picked image file.
		 * @param edge - the stored edge in pixels.
		 * @returns the artwork data URI and whether a flat background was keyed.
		 */
		async function prepareArtwork(file, edge) {
			const { canvas, context, width, height } = await readPickedImage(file);
			const image = context.getImageData(0, 0, width, height);
			const bounds = keyFlatBackground(image, width, height);
			if (bounds !== undefined) context.putImageData(image, 0, 0);
			const box = bounds === undefined ? { x: 0, y: 0, width, height } : bounds;

			const out = document.createElement("canvas");
			out.width = edge;
			out.height = edge;
			const outContext = out.getContext("2d");
			const side = Math.max(box.width, box.height) * 1.08;
			outContext.drawImage(
				canvas,
				box.x - (side - box.width) / 2,
				box.y - (side - box.height) / 2,
				side,
				side,
				0,
				0,
				edge,
				edge
			);
			return { artwork: out.toDataURL("image/webp", 0.92), keyed: bounds !== undefined };
		}
		//#endregion

		//#region settings card
		/**
		 * Form-level labels shared by both settings surfaces.
		 * @param t - the card's locale reader.
		 * @returns the labels the shared settings form renders.
		 */
		function formLabels(t) {
			return {
				unavailable: t("unavailable"),
				readOnly: t("readOnly"),
				saveFailed: t("saveFailed"),
				save: t("save"),
				saving: t("saving")
			};
		}

		/**
		 * An artwork picker: preview, file input, and the buttons around them.
		 *
		 * One control serves both artwork preferences — the brand mark and the
		 * thinking-status icon — because they differ only in copy, in the field they
		 * stage, and in the edge the picked picture is stored at. Each stages its own
		 * field, so the two are set independently of each other.
		 *
		 * @param props - copy, the field it stages, the stored edge, the staged value, and the write actions.
		 * @returns the picker control.
		 */
		function ArtworkField(props) {
			const { t } = props;
			const input = react.useRef(null);
			const [busy, setBusy] = react.useState(false);
			const [failure, setFailure] = react.useState("");
			const [notice, setNotice] = react.useState("");
			const preview = props.text;
			const inputId = "wg-" + props.field + "-file";

			const onPick = async (event) => {
				const files = event.target.files;
				const file = files === null || files === undefined ? undefined : files[0];
				event.target.value = "";
				if (file === undefined) return;
				setBusy(true);
				setFailure("");
				setNotice("");
				try {
					const picked = await prepareArtwork(file, props.edge);
					props.onPick(picked.artwork);
					if (!picked.keyed) setNotice(t("artworkUnkeyed"));
				} catch (error) {
					console.error(PLUGIN_ID + ": could not read the picked image", error);
					setFailure(t("iconFailed"));
				} finally {
					setBusy(false);
				}
			};

			return jsxs("div", {
				className: "wg-field",
				"data-artwork-field": props.field,
				children: [
					jsxs("div", {
						className: "wg-field-head",
						children: [
							jsx("span", { className: "wg-field-label", children: props.label }),
							props.overridden ? jsxs("span", {
								className: "wg-field-badges",
								children: [
									jsx("span", { className: "wg-field-tag", children: t("overridden") }),
									jsx("button", {
										type: "button",
										className: "wg-field-reset",
										disabled: props.disabled,
										onClick: props.onReset,
										children: t("reset")
									})
								]
							}) : null
						]
					}),
					jsxs("div", {
						className: "wg-image",
						children: [
							preview === ""
								? jsx("span", { className: "wg-image-empty", children: props.builtIn })
								: jsx("img", { className: "wg-image-preview", src: preview, alt: "" }),
							jsxs("div", {
								className: "wg-image-actions",
								children: [
									jsxs("div", {
										style: { display: "flex", gap: "8px", flexWrap: "wrap" },
										children: [
											jsx("button", {
												type: "button",
												className: "wg-button",
												disabled: props.disabled || busy,
												onClick: () => {
													if (input.current !== null) input.current.click();
												},
												children: busy ? t("iconWorking") : t("iconChoose")
											}),
											preview === "" ? null : jsx("button", {
												type: "button",
												className: "wg-button",
												disabled: props.disabled || busy,
												onClick: () => {
													setNotice("");
													props.onClear();
												},
												children: t("iconClear")
											})
										]
									}),
									jsx("input", {
										ref: input,
										id: inputId,
										type: "file",
										accept: "image/*",
										"data-field": props.field,
										style: { display: "none" },
										onChange: (event) => {
											onPick(event).catch(() => {});
										}
									})
								]
							})
						]
					}),
					failure === "" ? null : jsx("p", { className: "wg-error", children: failure }),
					notice === "" ? null : jsx("p", { className: "wg-hint", children: notice }),
					jsx("p", { className: "wg-hint", children: props.hint })
				]
			});
		}

		/**
		 * One-line description of what the theme is currently applying, used by the
		 * Plugins row. It reports the applied state rather than the form's drafts, so
		 * the row never claims a preference that has not been saved.
		 * @param t - the card's locale reader.
		 * @param current - the applied theme snapshot.
		 * @returns the summary text.
		 */
		function summaryText(t, current) {
			const mark = current.icon === "" ? t("summaryBuiltIn") : t("summaryCustom");
			const glyph = current.runningIcon === "" ? t("summaryBuiltIn") : t("summaryCustom");
			const copy = current.runningText === "" ? DEFAULT_RUNNING_TEXT : current.runningText;
			return [
				t("summaryIcon") + "：" + mark,
				t("summaryRunningIcon") + "：" + glyph,
				t("summaryRunningText") + "：" + copy,
				t("summaryScale") + "：" + Math.round(current.scale * 100) + "%",
				t("summaryRunningScale") + "：" + Math.round(current.runningScale * 100) + "%"
			].join(" · ");
		}

		/**
		 * A size control: one slider plus a readout.
		 *
		 * The shared `SettingsValueField` is a text box with a hint; a multiplier is
		 * something the user feels out rather than types, so this control replaces it
		 * with a range input on the same staged draft. It writes through the same
		 * `edit` action and the same `settingsNumberField` spec, so saving, resetting
		 * and the "overridden" badge keep working exactly as they do for the other
		 * fields, and the numeric draft stays the single stored form of the setting.
		 * Both size preferences use this one control; they differ only in the field
		 * they stage, their copy, and the multiplier a blank draft stands for.
		 *
		 * @param props - copy, the field it stages, the draft's fallback, and the write actions.
		 * @returns the labelled slider.
		 */
		function ScaleField(props) {
			const { t } = props;
			const value = scaleFromText(props.text, props.fallback);
			const inputId = "wg-" + props.field + "-scale";
			return jsxs("div", {
				className: "wg-field",
				"data-scale-field": props.field,
				children: [
					jsxs("div", {
						className: "wg-field-head",
						children: [
							jsx("label", { className: "wg-field-label", htmlFor: inputId, children: props.label }),
							props.overridden ? jsxs("span", {
								className: "wg-field-badges",
								children: [
									jsx("span", { className: "wg-field-tag", children: t("overridden") }),
									jsx("button", {
										type: "button",
										className: "wg-field-reset",
										disabled: props.disabled,
										onClick: props.onReset,
										children: t("reset")
									})
								]
							}) : null
						]
					}),
					jsxs("div", {
						className: "wg-scale",
						children: [
							jsx("input", {
								id: inputId,
								className: "wg-scale-input",
								type: "range",
								min: SCALE_MIN,
								max: SCALE_MAX,
								step: SCALE_STEP,
								value,
								disabled: props.disabled,
								"aria-label": props.sliderLabel,
								"aria-valuetext": scaleText(value),
								onChange: (event) => {
									props.onEdit(event.target.value);
								}
							}),
							jsx("output", {
								className: "wg-scale-readout",
								htmlFor: inputId,
								children: scaleText(value)
							})
						]
					}),
					jsx("p", { className: "wg-hint", children: props.hint })
				]
			});
		}

		/**
		 * The theme's settings surface. Registered twice: on the plugin's row in the
		 * Plugins page, where the owner asks for a summary or the page, and as a
		 * section of its own on the Settings panel.
		 *
		 * The controls are grouped into two cards — the brand mark with its size, and
		 * the thinking state with its icon, copy and size — because those two halves
		 * are set independently and reading them as one list made that hard to see.
		 * The grid falls back to one column when the panel is too narrow for two.
		 *
		 * @param props - the asked-for view, locale copy, the form snapshot, and its actions.
		 * @returns the summary line, or the form.
		 */
		function ThemeCard(props) {
			const { t } = props;
			const state = props.useWhaleGirlTheme((snapshot) => snapshot);
			if (props.view === "summary") return jsx("span", { className: "wg-summary", children: summaryText(t, readTheme()) });
			const disabled = !state.writable;
			const group = (title, children) => jsxs("section", {
				className: "wg-group",
				children: [jsx("h4", { className: "wg-group-title", children: title }), ...children]
			});
			return jsxs(primitives.SettingsForm, {
				labels: formLabels(t),
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: jsx("div", {
					className: "wg-groups",
					children: [
						group(t("groupIcon"), [
							jsx(ArtworkField, {
								t,
								disabled,
								field: "icon",
								edge: ICON_EDGE,
								label: t("icon"),
								hint: t("iconHint"),
								builtIn: t("iconBuiltIn"),
								text: state.icon.text,
								overridden: state.icon.overridden,
								onPick: (artwork) => {
									props.edit("icon", artwork);
								},
								onClear: () => {
									props.resetField("icon");
								},
								onReset: () => {
									props.resetField("icon");
								}
							}),
							jsx(ScaleField, {
								t,
								disabled,
								field: "iconScale",
								fallback: DEFAULT_SCALE,
								label: t("iconScale"),
								hint: t("iconScaleHint"),
								sliderLabel: t("iconScaleSliderLabel"),
								text: state.iconScale.text,
								overridden: state.iconScale.overridden,
								onEdit: (text) => {
									props.edit("iconScale", text);
								},
								onReset: () => {
									props.resetField("iconScale");
								}
							})
						]),
						group(t("groupRunning"), [
							jsx(ArtworkField, {
								t,
								disabled,
								field: "runningIcon",
								edge: RUNNING_EDGE,
								label: t("runningIcon"),
								hint: t("runningIconHint"),
								builtIn: t("runningIconBuiltIn"),
								text: state.runningIcon.text,
								overridden: state.runningIcon.overridden,
								onPick: (artwork) => {
									props.edit("runningIcon", artwork);
								},
								onClear: () => {
									props.resetField("runningIcon");
								},
								onReset: () => {
									props.resetField("runningIcon");
								}
							}),
							jsx(primitives.SettingsValueField, {
								id: "wg-running-text",
								label: t("runningText"),
								hint: t("runningTextHint"),
								overriddenLabel: t("overridden"),
								resetLabel: t("reset"),
								invalidLabel: t("invalidNumber"),
								disabled,
								...state.runningText,
								onEdit: (text) => {
									props.edit("runningText", text);
								},
								onReset: () => {
									props.resetField("runningText");
								}
							}),
							jsx(ScaleField, {
								t,
								disabled,
								field: "runningScale",
								fallback: DEFAULT_RUNNING_SCALE,
								label: t("runningScale"),
								hint: t("runningScaleHint"),
								sliderLabel: t("runningScaleSliderLabel"),
								text: state.runningScale.text,
								overridden: state.runningScale.overridden,
								onEdit: (text) => {
									props.edit("runningScale", text);
								},
								onReset: () => {
									props.resetField("runningScale");
								}
							})
						])
					]
				})
			});
		}
		//#endregion


		//#region plugin
		/** Required services: the slot registry, locale dictionaries, and the settings transport. */
		const inject = ["slots", "locale", "configForms"];

		/**
		 * Browser plugin body.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			// priority -1 renders below the official occupier (lowest renders), so the
			// shipped brand plugin stays enabled and keeps its wordmark registration.
			ctx.slots.inject("sidebar.brand.mark", () =>
				ctx.slots.register({ name: "sidebar.brand.mark", priority: -1 }, WhaleGirlBrandMark)
			);
			ctx.slots.inject("conversation.hero.brand.mark", () =>
				ctx.slots.register({ name: "conversation.hero.brand.mark", priority: -1 }, WhaleGirlHeroMark)
			);

			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-whale-girl: dictionaries");
			const t = ctx.locale.bind(NS);

			//#region settings namespace
			const scope = ctx.configForms.get(CONFIG_NS);
			const model = new primitives.SettingsFormModel(scope, [
				primitives.settingsTextField("icon"),
				primitives.settingsTextField("runningIcon"),
				primitives.settingsTextField("runningText"),
				primitives.settingsNumberField("iconScale"),
				primitives.settingsNumberField("runningScale")
			]);
			const store = model.bind(() => ({
				...model.shell(),
				icon: model.field("icon"),
				runningIcon: model.field("runningIcon"),
				runningText: model.field("runningText"),
				iconScale: model.field("iconScale"),
				runningScale: model.field("runningScale")
			}));
			ctx.effect(() => () => model.dispose(), "ui-whale-girl: settings form");
			//#endregion

			//#region running copy
			const displaced = new Map();
			const republish = () => {
				try {
					ctx.locale.publish(ctx.locale.getLocale().active, false);
				} catch (error) {
					console.warn(PLUGIN_ID + ": running copy republish failed", error);
				}
			};
			// Subscribing covers a dictionary registered after this plugin loads:
			// registration advances the snapshot revision, and re-running the rewrite is
			// a no-op once the copy already matches.
			const syncCopy = () => {
				if (rewriteRunningCopy(ctx.locale, displaced, runningCopy(theme))) republish();
			};
			ctx.effect(() => {
				const unsubscribe = ctx.locale.subscribe(syncCopy);
				return () => {
					unsubscribe();
					if (displaced.size === 0) return;
					restoreRunningCopy(ctx.locale, displaced);
					republish();
				};
			}, "ui-whale-girl: running copy");
			//#endregion

			// Every preference change repaints the marks and re-applies the copy; the
			// scope also reports writes made from another browser.
			ctx.effect(() => scope.subscribe(() => {
				adoptSettings(scope.getSnapshot().value);
				syncCopy();
			}), "ui-whale-girl: preferences");
			adoptSettings(scope.getSnapshot().value);
			syncCopy();

			const face = () => ({
				hooks: { whaleGirlTheme: store },
				...model.actions()
			});
			ctx.slots.inject("plugins.row.config", () =>
				ctx.slots.register({
					name: "plugins.row.config",
					key: ROW_CONFIG_KEY,
					locale: NS,
					inject: face
				}, ThemeCard)
			);
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register({
					name: "settings.section",
					id: SETTINGS_SECTION_ID,
					order: 60,
					label: () => t("title"),
					locale: NS,
					inject: face
				}, ThemeCard)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		//#endregion

		return module.exports;
	}
});
