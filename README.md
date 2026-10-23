# 工作区分组整理

把 DSH 侧栏的工作区归入自定义分组，按 分组 → 工作区 → 会话 三级浏览。分组只是插件自己的一层虚拟归类：工作区登记、会话、归档与置顶集合都不会被它改写。

[English](README.en-US.md)

## 特性

- **三级浏览。** 分组 → 工作区 → 会话。行高、字号、图标与折叠行为沿用官方侧栏，用的是同一套 `--dsw-*` 设计令牌和同一批官方组件（`Menu`、`Modal`、`Tooltip`、`Icon*`、`StateDot`），所以主题切换、右键菜单的模糊与透明都跟随外壳，不需要插件自己维护。
- **分组是独立的虚拟层。** 分组文档由插件自己的 Host 路由存放在 `$DSH_HOME/storages/`，与官方工作区注册表互不干涉；除非你点了重命名/归档/删除，插件不会改动任何工作区或会话。
- **空白会话按官方规则显示。** 每次「新建会话」都会留下一个占位会话（`blank`），官方侧栏只显示主视图当前持有的那一个并显示为「新会话」。插件遵循同一条规则：历史遗留的草稿不再堆成一行行与工作区同名的会话。
- **子代理会话不单独占一行。** 会话目录里带着子代理会话（`origin: 'subagent'`），官方侧栏把它们显示在父会话的表头下，而不是当成顶层行。插件遵循同一条规则——分组树和「未分组」桶都是如此，因此批量归档也碰不到子会话。
- **归档会话，也能找回来。** 归档这一行就从列表里移走，和官方行为一致；视图菜单里有「隐藏已归档 / 全部会话(含已归档) / 只看已归档会话」三档，选中的一档会记住。查看归档行时，行尾的按钮变成「从归档恢复」，行本身不可点击（因为归档会话无法打开）。
- **不属于任何工作区的会话仍然有行。** 工作区靠自己的成员列表持有会话，所以删掉一个工作区——或干脆在没有工作区的情况下开会话——都会留下不属于任何工作区的会话。官方侧栏把这类会话收在「未分组」桶里；插件用同一套推导渲染同一个桶，这些会话因此仍然能打开，而不是从树里消失。
- **组级批量操作。** 组菜单可一次归档组内全部会话，或删除组内全部工作区（都有确认弹窗，并显示影响数量）。确认里的数量就是实际操作数量：已归档的会话、占位会话与子代理会话都不计入，因此不会出现「说 3 个、归档 10 个」。
- **右键不与其它插件抢。** 菜单在 `contextmenu` 阶段声明：如果某个右键菜单插件已经接管了这一行，事件在捕获阶段就被它拦下，插件不会弹出第二个菜单，也不会用 mousedown 绕开仲裁。
- **折叠状态会记住。** 显式展开/折叠的选择存进 localStorage，刷新后仍是同一棵树。

## 工作原理

```text
┌─ DSH Web 外壳 ────────────────────────────────────────────────┐
│                                                              │
│  sidebar.workspaces 槽位（单槽位，按 priority 取最低的条目）    │
│    ├─ 官方 WorkspaceBrowser   priority 0   （仍然注册）        │
│    └─ 本插件 GroupedBrowser   priority -100（胜出渲染）        │
│                                                              │
│  GroupedBrowser                                              │
│    ├─ 读官方快照：useWorkspaces / useSessions / useSessionStatus
│    ├─ 写官方操作：ctx.get('uiWorkspace' | 'workspaces' | 'sessions')
│    └─ 分组文档 ←→ /api/workspace-organize（Host 路由）          │
└──────────────────────────────────────────────────────────────┘

Host 半边（src/index.ts）
  GET  /api/workspace-organize   → 读取分组文档（loopback 可信）
  POST /api/workspace-organize   → 同源写入，原子落盘
        └─ $DSH_HOME/storages/workspace-organize-groups.json
```

官方条目依然注册在同一个槽位上（`priority` 0），所以它声明的子槽位继续存在；本插件以更低的 `priority` 赢得这个单元格的渲染。这也是为什么组件只能拿到 owner 属性与框架标准钩子：官方条目自己的注入面不会转发给一个遮蔽条目，所有业务操作都通过 `ctx.get` 惰性解析官方服务。

## 安装

### 从 npm / GitHub

```sh
dsh plugin --profile <profile> add dsh-workspace-organize
# 或直接从仓库安装：
dsh plugin --profile <profile> add github:GT-610/dsh-workspace-organize
```

装好后重启 DSH 让 Host 重新扫描插件表。构建产物 `dist/` 随仓库提交，因此从 git 安装不需要给构建脚本开白名单（DSH 默认阻止包执行构建脚本，带 `prepare` 的包会被直接拒绝安装）。

### 本地开发

```sh
git clone https://github.com/GT-610/dsh-workspace-organize
cd dsh-workspace-organize
pnpm install          # 开发依赖；dist/ 已提交，克隆后可直接软链使用
pnpm build            # 改了源码之后再构建 dist/
```

再把仓库软链进 profile 的 `node_modules`，重启 DSH：

```powershell
# Windows
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\dsh-workspace-organize" -Target (Get-Location)
```

```sh
# macOS / Linux
ln -s "$PWD" ~/.dsh/profiles/<profile>/node_modules/dsh-workspace-organize
```

之后 `pnpm dev`（`tsdown --watch`）改完源码刷新页面即可。

## 使用

| 想要的效果 | 操作 |
| --- | --- |
| 新建分组 | 标题栏的滑杆按钮 → 新建分组 |
| 重命名 / 解散分组 | 分组行右键或 ⋯ |
| 归档组内全部会话 | 分组行 ⋯ → 归档组内全部会话… |
| 删除组内全部工作区 | 分组行 ⋯ → 删除组内全部工作区… |
| 把工作区移入分组 | 工作区行 ⋯ → 移入分组 → 选分组 |
| 移出分组 | 工作区行 ⋯ → 移出分组（仅在该工作区属于某个分组时出现） |
| 在此工作区新建会话 | 工作区行 ⋯ 或行尾的 ＋ |
| 归档 / 恢复单个会话 | 会话行尾的归档按钮，或右键菜单 |
| 查看已归档会话 | 标题栏滑杆按钮 → 全部会话(含已归档) / 只看已归档会话 |
| 展开 / 折叠全部 | 标题栏滑杆按钮 → 展开全部 / 折叠全部 |
| 按标题搜索会话 | 标题栏放大镜 |

## 数据与隐私

- 分组文档只存在两个地方：Host 上的 `$DSH_HOME/storages/workspace-organize-groups.json`，以及浏览器 localStorage 里的镜像（断网时先落镜像，恢复后仍以 Host 为准）。
- 归档 / 置顶集合不归插件所有：插件只是调用官方的归档与恢复操作，改的是官方那一份状态。
- 写入是原子的：临时文件 + `rename`，并且走一条串行写链，避免并发请求互相覆盖。客户端也按编辑顺序逐个提交，所以 Host 上最终留下的是最后一次编辑，而不是最后一个到达的请求。
- 读接口开放（服务本身只监听回环地址），写接口只接受同源浏览器请求：优先看 `Sec-Fetch-Site`，否则回退比对 `Origin` 与 `Host`，两者都没有的请求一律拒绝。读响应带 `cache-control: no-store`，客户端也以 `cache: 'no-store'` 取，刷新后读到的一定是当前状态。
- 文档的**结构**由两侧共用的同一个校验器限制：最多 200 个分组、每组最多 500 个工作区、全文档最多 2000 条成员，id 最长 128 字符、分组名最长 200 字符。非法文档整份拒绝，不做部分应用；未知字段会被丢弃，因此更高版本写的文档仍能读取；同一个工作区在文档里只算一次归属，重复的成员会被丢弃而不是让整份文档报错。分组对话框的输入框带着名称上限（`maxLength`），文档会拒绝的名称根本敲不出来。
- **请求体**另由 Host 路由在解析之前单独设限，与上面那套校验彼此独立：超过 2 MiB 的请求体直接回 `413`，请求根本到不了校验器；真的进了校验器却解析失败的才回 `400`。这道闸量的是落到线上字节数，所以校验器会丢弃的东西照样计入——未知字段、重复的成员都算——于是一个请求可能被拒，而它归一化出来的文档其实是合法的。闸按字节而非字符计，id 里一个控制字符在 JSON 里会变成 `\uXXXX` 六个字节，所以上限是按「结构化上限下的最坏编码」留出余量定的；它拦的是结构化上限根本不关心的那部分体积。

## 开发

```text
src/
├─ index.ts                Host 半边：路由、同源校验、原子存储
├─ shared/contract.ts      两侧共用的分组文档类型与校验器
└─ client/
   ├─ index.tsx            apply()、官方服务组装、崩溃边界、槽位注册
   ├─ contract.ts          Client 侧契约（Services / 注入面）
   ├─ Browser.tsx          三级树、行、菜单、弹窗
   ├─ select.ts            纯派生：可见行规则、状态汇总、时间分档
   ├─ groups.ts            分组文档传输与 localStorage 镜像
   ├─ i18n.ts              中英文案
   └─ styles.ts            行布局样式表（只用 --dsw-* 令牌）
tests/
├─ select.spec.ts          纯派生（可见行规则、汇总、时间分档）
├─ contract.spec.ts        文档校验器与它的结构上限
├─ host.spec.ts            同源写入闸门、请求体上限、$DSH_HOME 解析
├─ browser.spec.tsx        jsdom 里挂载组件，验证行与菜单接线
└─ stubs/primitives.tsx    官方组件的替身（原因见下）
```

```sh
pnpm typecheck   # tsc --noEmit，对着官方发布的类型检查
pnpm lint        # oxlint
pnpm test        # vitest（jsdom）
pnpm build       # tsdown → dist/
pnpm check       # 以上四件事
pnpm dev         # tsdown --watch
```

几点约定，改动前值得先读：

- **类型来自官方发布的包。** `@deepseek-ai/dsh-client-ui-workspace`、`-ui-slots`、`-ui-session`、`-ui-sidebar`、`-ui-layout`、`-ui-renderer` 以及 `@deepseek-ai/dsh-api-*` 都作为 devDependency 安装，只用于类型与测试；槽位契约（`PropsRuntime<'sidebar.workspaces'>`）一旦漂移，`pnpm typecheck` 会先失败，而不是等侧栏崩掉。
- **`dist/` 是提交进仓库的。** DSH 默认阻止插件包执行构建脚本（带 `prepare` 的 git 安装会被直接拒绝，除非在 profile 的 `pnpm-workspace.yaml` 里单独放行），所以交付物随仓库提供，`dist/` 里就是安装后真正加载的东西；CI 会重新构建并比对，防止它和源码脱节。
- **客户端产物必须是闭包工厂。** 外壳以脚本方式加载 `exports["./client"]`，期望它调用 `window.__ModuleLoader__.load({ id, factory })`；`tsdown.config.ts` 用 banner/footer 把 CJS 分块包进这个工厂，并用短横线外的基线模块（`react`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives` 等）保持外部依赖。
- **组件测试用的是官方组件的替身。** 官方 primitives 发布的 ESM 入口并未声明它实际用到的运行时依赖（`clsx`、`mdast-*`、`micromark-*`、shiki 语法目录），只有外壳里被预置的那份 bundle 能加载它。因此 jsdom 测试通过 `tests/stubs/primitives.tsx` 替换它，验证的是插件自己的接线；外观本身由外壳负责。
- **样式表是全局的。** 插件 CSS 由页面直接注入，不是 shadow root，所以每个类名都带 `dwo-` 前缀。

## 兼容性

- 需要 DSH `>= 0.2.1-rc.2`（`package.json` 的 `engines.dsh`，安装时会被检查）。
- 仅 web 半边：desktop 外壳同样用 web 渲染，因此 tauri 与浏览器安装行为一致。
- 与右键菜单类插件共存：本插件不抢已被接管的行，也不会因为别的插件存在而失效。

## 许可

[MIT](LICENSE)
