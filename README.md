# dsh-plugin-whale-girl

[![dshbase 实测可装](https://dshbase.com/badges/dsh-plugin-whale-girl.svg)](https://dshbase.com/zh/plugins/dsh-plugin-whale-girl/)
[![dshfind](https://dshfind.com/api/badge/aigisx/dsh-plugin-whale-girl)](https://dshfind.com/zh/plugins/aigisx/dsh-plugin-whale-girl?ref=badge)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/aigisx/dsh-plugin-whale-girl?label=stars)](https://github.com/aigisx/dsh-plugin-whale-girl/stargazers)

> **项目简介：修改应用内的图标，并调整尺寸大小。**

把 DeepSeek Harness **应用内**的鲸鱼图标换成鲸鱼娘，「思考中」前面的小图标换成一只**蓝底小米饭小碗**，并把中文的「深度求索中」改成「努力干饭中」；两个图标的大小都可以在应用内的**插件设置**里单独调整。

这是一个第三方 DSH **bundle + client plugin 双面包**：安装进 profile 后，官方 `app.asar` 一行都不改，因此应用升级后自动保留。

当前版本：**V0.3.0**（见 [更新记录](#更新记录)）。

## 目录

- [改了什么](#改了什么)
- [安装](#安装)
- [插件设置](#插件设置)
- [换素材](#换素材)
- [构建产物与自测](#构建产物与自测)
- [常见问题](#常见问题)
- [卸载 / 回滚](#卸载--回滚)
- [兼容性设计](#兼容性设计)
- [更新记录](#更新记录)

## 改了什么

| 位置 | 机制 | 说明 |
|---|---|---|
| 侧边栏左上角图标 | slot 遮蔽 | 以 `priority: -1` 注册 `sidebar.brand.mark`（越低越优先），官方 `dsh-client-ui-brand-official` 保持启用 |
| 新会话首页的鱼 | slot 遮蔽 | 注册 `conversation.hero.brand.mark`（该 slot 原本空着，走官方 `HeroFish` 回落） |
| 「思考中」左侧的小图标 | 注入 CSS | 靠 `[data-chat-running]` + `[class*="_runningIcon"]` 命中，隐藏官方 APNG/静态 SVG 后重画；**默认是内置的蓝底小米饭，也可以单独换图、单独放大** |
| 浏览器标签页图标 | 注入 `<link rel="icon">` | 追加而不删除官方链接 |
| `深度求索中` / `深度求索中，用时 {duration} ···` | 改写 `chat` 命名空间 zh 字典 | 只改 zh；英文界面保持官方 `Deep diving` |
| 图标大小 | 两个 mark 组件乘以设置里的倍数，并放开侧边栏对图标的裁剪 | **默认 1.8（放大 80%）** |
| 思考中图标大小 | 官方那 14px 的盒子乘以设置里的倍数 | **默认 1×（即官方尺寸）**；与上面的图标互不影响 |

**没有动**：侧边栏「DeepSeek Harness」字标、英文文案、任务栏/托盘/欢迎页/`app.asar` 内任何文件。

## 安装

```powershell
& "<DeepSeek Harness>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "<本目录的绝对路径>"
```

命令会把它装成 `link:` 依赖、写进 profile 的 `dsh.profile.bundles` 并启用（改完源码只需重启，不用重装）。
也可以走应用内 侧边栏 →「插件」→「添加插件」，填本目录的绝对路径。

> ### ⚠️ 这个包只插入一行，不要再手写第二行
>
> 本包自带 `cordis.patch.yml`，里面就是 `- insert: [{ id: whale-girl, name: 'dsh-plugin-whale-girl' }]`；
> 把包列进 profile 的 `dsh.profile.bundles` 之后，Loader **自己就会把这一行插进去**。
> 如果你（或某个安装脚本）又在 `profiles/<名称>/cordis.patch.yml` 里手写一份同样的 `insert`，
> 组合结果里就会出现**两行同 id 的 `whale-girl`**，而 DSH 的设置文档从此**再也写不进去**：
>
> ```
> Configuration for "whale-girl" is overridden by a home patch or command-line overlay
> ```
>
> 原因见[常见问题](#保存一直失败思考中图标大小也不生效)；V0.3.0 起 node 半边会在启动时把这条重复行报进日志。

安装后重启 DeepSeek Harness 生效。快速自检（不用开 DevTools）：

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:19387/plugins/dsh-plugin-whale-girl/client.js' -UseBasicParsing |
    Select-Object StatusCode, @{n='len';e={$_.Content.Length}}
```

返回 `200` 即表示宿主已经把插件纳入启动图。
（桌面应用把插件模块走自己的 `dsh-app://` 通道时，这条 HTTP 路由可能返回 `404`，此时以应用内是否生效为准。）

## 插件设置

设置入口有两个，指向同一份配置：

- 侧边栏 →「插件」→ 点本插件 → 点 `whale-girl` 这一行 → **配置**（`plugins.row.config`，key = `dsh-plugin-whale-girl#whale-girl`）；
- 侧边栏 →「设置」→ **鲸鱼娘主题**（`settings.section`）。

五个设置按用途分成**两栏**（面板够宽时并排成两列，窄了自动堆成一列）：

| 栏 | 设置 | 说明 |
|---|---|---|
| **图标** | 图标 | 侧边栏 / 新会话首页 / 标签页的图。「选择图片…」直接挑本地图片。纯色背景会自动抠掉，画面居中裁切并缩放到 256px 后存起来；选完点「保存」生效。「恢复内置」清空覆盖。 |
| **图标** | 图标大小 | 侧边栏与新会话首页图标的放大倍数：**滑块，0.2×–3×，每档 0.2×，默认 1.8×**。 |
| **思考中** | 思考中图标 | 「努力干饭中」前面的那个小图标，**与上面的图标互不影响**：自己挑一张图，按 64px 保留原色存起来。默认是内置的蓝底小米饭小碗。 |
| **思考中** | 思考中文案 | 显示在「思考中」图标旁的中文，默认 `努力干饭中`。留空即用默认值。计时后的长文案会自动带上「，用时 X秒 ···」。 |
| **思考中** | 图标大小 | 「思考中」那个图标本身的放大倍数：**同一个滑块量程，默认 1×＝官方的 14px**。 |

五个字段（`icon` / `runningIcon` / `runningText` / `iconScale` / `runningScale`）各存各的：改一个不会动另一个，`tools/selftest.mjs` 与 `tools/card-check.mjs` 都守着这条。两个滑块都按 0.2 对齐并夹在 0.2–3 之间，所以读数就是实际生效的倍数。

### 设置是怎么存下来的

宿主会为**声明了 `.volatile()` 字段的 Config** 的每个活动 entry 开放一个设置命名空间，命名空间就是 entry id —— 也就是 `whale-girl`。所以 `lib/index.js` 里那份 `Config` 就是全部机制：它同时决定了「有哪些字段」和「哪些字段可以在表单里改」。宿主的 `describe()` 用 `volatileForm` 走一遍活 schema，走不出字段的 entry 会被整个跳过，因此字段漏标 `volatile()` 会表现为「设置页是空的」而不是报错。

写入通过 `ctx.configForms.get("whale-girl")` 的共享镜像落到宿主的设置文档（profile 的 `cordis.patch.yml`），所以一个浏览器里改了，其它打开的页面会跟着变。

**图片是以 data URI 存在设置文档里的**（256px WebP，通常几十 KB）。选图时浏览器端就直接抠图 + 缩放，不经过宿主，也不写任何临时文件。

### 内置的「思考中」图标

`assets/running.png`（128px）：一只碗口冒尖的小米饭，两根筷子从右上斜插进饭里。它由原图经 `tools/prepare-thinking.py` 抠底、裁切、缩放而来——原图是白底（准确说是一张把「透明」画成棋盘格的图），脚本按下面那条规则把底抠掉，碗和米饭的白色原样保留。

它和官方那个小鲸鱼不同：官方用 alpha 遮罩 + `currentColor` 着色，本插件直接把彩色图片贴上去。自带背景，所以浅色/深色主题共用一张图，不需要 `*-dark` 变体；代价是它不会跟着文字颜色变。

它的大小也不写死在样式表里：官方那个 `width:calc(14px + var(--dsh-content-font-delta,0px))` 被本插件改写成同一个表达式**乘以 `--wg-running-scale`**（没有这个变量时按 1 算），设置里的滑块就是往 `:root` 写这个变量。所以「思考中图标大小」不需要额外规则，跟着官方的字号增量一起缩放。

换内置素材：

```powershell
python tools\prepare-thinking.py assets\你的图.png --preview ..\_whale-girl-work\preview.png
node tools\build-client.mjs
```

### 抠底规则（内置素材与设置里挑的图共用）

两条，客户端 `keyFlatBackground()` 与 `tools/prepare-thinking.py` 各实现一遍：

1. **只抠从边界连通的底色**：四个角颜色一致（差值 ≤ 24）才算有底色，然后从四边洪泛填充，容差 ±30。画面被角色包住的颜色永远不会被碰。
2. **只在贴着底色处做边缘羽化**：抗锯齿过渡像素按「离底色多远」给部分 alpha，但**仅限八邻域里真的有被抠掉的像素**的那种。以前是「凡是接近底色的像素一律羽化」，结果画在底色里的图形被挖空——白底上的白碗、白米饭，53k 个像素被羽化，其中只有 1.7k 真的在边上。

另外会**清掉小于画面千分之一的碎块**（背景是棋盘格、纸纹、噪点时，洪泛填充会在格子缝里留下小碎点）。实测那张素材：主体是 100,790 px 的一整块，其余 145 块全都不到 135 px，分得很干净。

> 想换回一根线的鲸鱼剪影？不用改代码：在设置里给「思考中图标」挑一张图即可（白色背景会被自动抠掉）。构建时 `.svg` 优先于 `.png`。

### 图标大小为什么是一条侧边栏专用的规则

官方的侧边栏给品牌图标留的是一个 **24px 的盒子**，并且把它裁掉超出的部分：

```
._logoRow{height:60px;padding:8px 0 8px 4px;overflow:hidden}   ← 整行也裁
._brandIdentity{height:24px}                                   ← 高度被钉死
._brand{overflow:hidden}                                       ← 真正下刀的地方
```

于是倍数一旦超过 1×，图标上下就被切掉：1.25× 只剩 80%，1.8× 只剩 56%，2× 只剩一半。这套规则是 CSS Module 的哈希类名，本插件按**后缀**匹配（和它匹配 `_runningIcon` 是同一套办法），并用 `:has()` 锚在「真正装着我们这个图标」的那个盒子上——否则后缀会连桌面引导页里同名的 `_brand` 一起命中。滑块量程是 0.2×–3×，所以这些规则必须让 24px 的盒子一直长到 72px 都不裁。

构建产物里的三条规则（见 `tools/build-client.mjs`）：

| 规则 | 作用 |
|---|---|
| `[class*="_brandIdentity"]:has(> [class*="_brandMark"]){height:auto;min-height:24px}` | 让这个盒子跟着图标长高，1× 时仍是 24px，布局不变 |
| `[class*="_logoRow"]:has([class*="_brandIdentity"]){overflow:visible}` | 整行不再裁掉探出去的部分 |
| `[class*="_brand"]:has(> [class*="_brandIdentity"]){overflow-x:clip;overflow-y:visible}` | 横向仍然裁（窄侧边栏里字标照旧被截断），纵向放行——官方在 Windows 标题栏布局下给这个盒子加了 `translateY(1px)`，`overflow:hidden` 会连官方图标一起咬掉底下 1px |

`overflow-x:clip` 与 `overflow-y:visible` 必须成对：按规范，另一轴是 `hidden` 时 `visible` 会被算成 `auto`，那就又变成裁剪容器了。

「思考中」那一行没有这个问题：官方的 `_running` / `_runningContent` 既不设高度也不裁溢出，所以放大后整行会跟着长高。

## 换素材

把图片丢进 `assets/`，然后重新构建：

```powershell
node tools/build-client.mjs
```

支持 `.svg` / `.png` / `.webp`。文件名（除第一个外都可选，缺省自动回落）：

| 文件名 | 用途 | 缺省回落 |
|---|---|---|
| `icon.*` | **必需**：hero 图标，以及所有槽位的兜底 | — |
| `icon-dark.*` | 主图标的深色主题变体 | `icon` |
| `icon-small.*` | **侧边栏 24px 专用**小尺寸素材。256px 才看得清的细节缩到 24px 会糊成一团，换一张「头像特写」或简化图形效果会好很多。当前素材本身就是头部特写，所以没有这个文件，自动回落 | `icon` |
| `icon-small-dark.*` | 小尺寸素材的深色变体 | `icon-small` |
| `hero.*` | 新会话首页专用（可给一张更宽比例的图） | `icon` |
| `hero-dark.*` | hero 的深色变体 | `hero` |
| `running.*` | **思考中图标**：14px 显示尺寸，保留原色（不是剪影，也不再被当作 alpha 遮罩）。当前是 `running.png`（由 `tools/prepare-thinking.py` 生成，128px） | `icon` |
| `favicon.*` | 标签页图标；单独放一张 64px 的小图，可以避免把整张大图再内联一份 | `icon` |

每个**不同的文件只内联一次**：构建脚本把素材写成 `:root` 下的 CSS 变量，各条规则用 `var()` 取用，所以同一张图被多个槽位共用也只占一份 base64。当前产物 `lib/client.js` 约 240 KB。

### 白底插画怎么处理

直接把白底 PNG 丢进去是不行的：贴到深色主题上会是一个白色方块。用附带的脚本抠图：

```powershell
python tools/prepare-artwork.py "路径\原图.png" --erase 1180,1420,1536,1536
```

它会输出 `icon.png`(256²) / `favicon.png`(64²)，外加一张 `running.png`(64² 剪影)。三个关键处理：

- **边界连通洪泛填充**去背景，而不是「凡白即删」——否则白色额带、白蕾丝领、鳍上的白须边会被掏空。
- **小碎点愈合**——洪泛填充会连同「被角色包住的一小块白」一起保留，而这类白块常常只是抠图伪影：几个像素的白点缩到 256px 后就变成一个浅灰点，在大尺寸、深色主题下看得见。脚本按**面积**区分：真正的白色细节比伪影大一到两个数量级（实测 2321px vs 32px），所以低于阈值（源面积/12000）的封闭白块会被填成周围角色的颜色。
- **预乘 alpha 缩放**——直接缩放 RGBA 会把已删掉的白底混进边缘像素，在深色背景上留下白晕。

`--erase x0,y0,x1,y1` 用来抹掉角落的生成水印（可重复）；脚本会打印「其中有多少像素原本是图形」，从而确认没有误伤主体。`--small-fraction 0.58` 可选，用来额外生成 `icon-small.png`；不给就不生成。

### 深色主题变体

`--dark-lift 0.25` 会额外生成 `icon-dark.png`：把画面朝白色做 screen 混合提亮，暗部提得多、亮部几乎不动，色相保持不变。实测（对 `#14161c` 的 WCAG 对比度）：

| 素材 | 平均亮度 | 低于 3:1 的像素占比 | 平均饱和度 |
|---|---|---|---|
| 不提亮 | 123.9 | 39.4% | 0.52 |
| 提亮 15% | 143.6 | 20.2% | 0.36 |
| 提亮 20% | 150.1 | 11.0% | 0.32 |
| **提亮 25%（当前）** | **156.4** | **0.2%** | **0.29** |
| 提亮 35% | 169.8 | 0.0% | 0.23 |

25% 是拐点：再往上对比度收益几乎为零，饱和度却在持续掉。

**深色规则挂在 `body[data-ds-dark-theme]` 上，不使用媒体查询**：DSH 的深色调色板是 `dsh-client-ui-theme` 通过这个属性标记的，和操作系统的 `prefers-color-scheme` 是两回事；按媒体查询写深色变体，在「系统浅色 + 应用深色」时就会用错素材。「思考中」的小图标自带蓝底，浅色深色共用一张，不挂 `*-dark`。

## 构建产物与自测

构建脚本把素材内联成 base64 写进 `lib/client.js`——这是浏览器那一半**唯一**的产物，不要手改。改完 `lib/client.js` 后重启应用生效（桌面 profile 默认没有开 client 插件 HMR）。

```powershell
node tools/host-check.mjs          # node 半边：设置字段、重复行自检（纯 node，无依赖）
node tools/selftest.mjs            # 在 VM 里跑 lib/client.js：slot / 设置 / 文案 / 降级行为
node tools/card-check.mjs          # 起本地服务 + 无头 Chromium，把设置卡片渲染成真 DOM 并量它
node tools/render-check.mjs        # 生成 tools/render-check.html：样式表渲染验证页
node tools/pipeline-check.mjs      # 起本地服务 + 无头 Chromium，端到端跑「选择图片」链路
node tools/sidebar-fit-check.mjs   # 起本地服务 + 无头 Chromium，量侧边栏图标有没有被裁
```

`sidebar-fit-check.mjs` 需要从**装好的应用**里读侧边栏样式：它会按顺序找当前用户与全机的标准安装位置
（`%LOCALAPPDATA%\Programs\DeepSeek Harness`、`%ProgramFiles%\DeepSeek Harness`、`%ProgramFiles(x86)%\…`）；
装在别处（例如 `D:\DeepSeek Harness`）时把路径显式传给它：

```powershell
node tools/sidebar-fit-check.mjs --asar "D:\DeepSeek Harness\resources\app.asar"
```

`host-check.mjs` 覆盖「重复行会让设置写不进去」这条自检的全部判定：干净的 profile patch、块式/流式重复行、home patch 里的重复行、文件缺失、`ctx.inject` 不可用、`profileContext` 结构异常。它跑在纯 `node` 下（判定逻辑在无依赖的 `lib/rows.js`）；运行环境能解析 `@deepseek-ai/schemastery` 时，它还会额外验证 node 半边的五个 volatile 字段，否则打印一行 `skip`。

`selftest.mjs` 用桩 `window`/`document`/`react`/primitives 与桩 locale、设置服务驱动 `apply(ctx)`，覆盖：四个 slot 的注册与 `priority`/`key`、locale 命名空间、默认与自定义的图标放大、两栏分组的成员、两个滑块的量程/对齐/夹取/默认值、五个字段各自独立暂存、文案改写与长文案、晚注册字典、摘要视图、卸载还原、以及「内部结构变了就静默不动、绝不抛错」。

`card-check.mjs` 把 `react/jsx-runtime` 产出的元素对象**展开成真 DOM**（展开的是插件自己的组件，不是手抄一份标记），套上构建产物里的样式表后用无头 Chromium 量那些只有排版才知道的事：面板宽时两栏并排、窄时自动一栏、每组第一个控件紧贴标题、两个滑块都是 0.2–3 / 每档 0.2、读数分别是 `1.8×` 与 `1.0×`，以及「思考中」盒子随 `--wg-running-scale` 真的从 14px 变到 42px、清掉变量后又回到 14px。它顺带把这一页截成 `tools/card-check.png`。

`sidebar-fit-check.mjs` 直接从装好的 `app.asar` 里读侧边栏那一半（样式表原文 + 它自己生成的哈希类名），把插件样式表套到官方元素结构上，0.5×–2× 逐档量三种位置的图标——展开侧边栏、折叠导轨、以及 Windows 标题栏布局下的展开侧边栏。每档两种量法：按 overflow 链算出可见比例，再在图标框上取九个点做命中测试。判据是：`after` 一列一档都不能被裁，`before` 一列至少要有一档仍被裁——看不见 bug 的检查什么也证明不了。

`pipeline-check.mjs` 是目前唯一能验证**图片选择**的办法（`createImageBitmap`、2D canvas、`getImageData`、`toDataURL("image/webp")` 只能在真浏览器里跑）。它给两个图片来源各塞一张「白底 + 蓝色圆盘」的合成图，量各自的产物：图标是 256×256 的 WebP、思考中图标是 64×64 的 WebP，两者都保留原色、透明占比都在 30% 左右；再喂一张「白底 + 深蓝圆环」，抠底必须保住环里那片白（这是「白底上的白碗被挖空」那个 bug 的回归测试）。

`render-check.mjs` 生成一个页面，把构建产物里的真实样式表套到官方 `_runningIcon` / `_runningWhaleAnimated` / `_runningWhaleStill` 结构上，截图即可确认贴上去的是内置小碗、官方的静态回退图形确实被压掉、而没被选中的槽位保持空白。

## 常见问题

### 「保存一直失败」，思考中图标大小也不生效

**症状**：设置卡片能打开、滑块能拖、读数也会变，但点「保存」永远失败（卡片底部出现「本部署没有接受这些值，已保留供你修改。」），因此 `--wg-running-scale` 从来没被写过，「思考中图标大小」怎么调都不生效。

**原因**：profile 的 `cordis.patch.yml` 里多了一行 `- insert: [{ id: whale-girl, ... }]`，而本包自带的 patch 已经插入过同一行，于是组合结果里有两行同 id 的 `whale-girl`。DSH 的设置写路径在这种情况下的行为是：

1. `ConfigEditor.edit()` 把新配置写到最后一行带这个 id 的行上；
2. 写完后的回读校验却用 `find()` 取**第一行**带这个 id 的行做比较；
3. 第一行（bundle 自己插的那行）没有 config，比较不相等 → 直接抛错：

```
Configuration for "whale-girl" is overridden by a home patch or command-line overlay
```

`settings.mutate` 把它包装成 `settings/rejected`，浏览器半边只看得到「失败」，看不到原因——所以表现为「保存一直失败」。**卸载 `unset` 之所以看起来成功**，是因为它对一个不存在的字段不会产生任何 config，回读比较自然相等（于是又白写一遍文件）。

**处理**：删掉 profile patch 里那一行（本包已经插过），然后重启应用：

```powershell
# 例如 profiles/desktop/cordis.patch.yml 里删掉：
# - insert:
#     - id: whale-girl
#       name: 'dsh-plugin-whale-girl'
```

V0.3.0 起，node 半边在启动时会检查 profile patch 与 home patch，发现重复行就写一条日志：

```
whale-girl: <文件> declares the entry row whale-girl, which this bundle's own
cordis.patch.yml already inserts. ... remove that duplicate insert row and restart the application.
```

### 设置页是空的

`lib/index.js` 里的字段漏标 `.volatile()` 就会这样：宿主只会把 volatile 字段投影成表单，走不出字段的 entry 整个被跳过。对照 `tools/host-check.mjs` 的 `settings surface` 一节。

### 图标放大了被切掉

侧边栏默认把图标盒子裁到 24px、整行 `overflow:hidden`。本插件带了三条放行规则（见[上文](#图标大小为什么是一条侧边栏专用的规则)），`tools/sidebar-fit-check.mjs` 就是这条的回归测试；如果官方类名结构变了，改动会退化成「又被裁」而不是侧边栏坏掉。

## 卸载 / 回滚

- 应用内 侧边栏 →「插件」→ 关掉「鲸鱼娘主题」；或
- 从 `profiles/<名称>/package.json` 的 `dsh.profile.bundles` 里删掉 `dsh-plugin-whale-girl`；或
- `... dsh.cmd plugin --profile desktop remove dsh-plugin-whale-girl`

三种方式都会让界面回到官方原样。插件被卸载时会把改写的文案还原（`ctx.effect` 的清理逻辑）。

## 兼容性设计

- **不用 `instanceof Map`** 判断 locale 内部结构，改用鸭子类型（`typeof dicts.get === "function"`）：既能跨 realm 工作，也能容忍未来换成任何保持 Map 契约的注册表。
- **所有内部访问都有守卫**：`locale.dicts` 结构一变，整个改写变成无操作，文案保持官方原文，界面不受影响。
- **CSS 选择器只用后缀匹配**（`[class*="_runningIcon"]`）和稳定 data 属性（`[data-chat-running]`），构建哈希前缀变化不影响。
- **slot 用 `priority: -1` 遮蔽**而不是禁用官方插件：就算本插件整体加载失败，侧边栏仍回落到官方图标 + 字标。
- **node 半边只有一份 `Config` 与一个自检**，自检跑在 `ctx.inject(["profileContext"], …)` 的可选子 fiber 里并全程 try/catch：没有设置文档的部署照常出主题，自检出错也绝不会拖住插件挂载。
- **只依赖冻结的平台模块表**（本插件只 `require("react/jsx-runtime")`），不需要声明 `dsh.client.external`。

## 更新记录

- **V0.3.0**
  - 修复「思考中图标大小不生效 / 保存一直失败」：设置写入不再被 profile patch 里重复的 `whale-girl` 行挡住；node 半边新增重复行自检与日志（`lib/rows.js`、`tools/host-check.mjs`）。
  - 项目简介改为「修改应用内的图标，并调整尺寸大小。」，并补上本 README。
- 未发布的早期版本：图标 / 思考中图标 / 思考中文案 / 两个大小滑块；图层抠底与深色变体；侧边栏与思考中盒子的尺寸放行规则。
