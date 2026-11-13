[English](README.en-US.md)

# dsh-workspace-organize

![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)

一个 DSH 插件，把侧栏工作区归入自定义分组，按 分组 → 工作区 → 会话 三级浏览。分组是插件维护的虚拟层，归类本身不改写官方数据。

## 特性

- **三级浏览。** 分组 → 工作区 → 会话。行高、字号与图标都和官方侧栏一致，折叠行为也一样；主题与菜单外观跟随外壳。
- **分组独立存放。** 分组文档存放在 `$DSH_HOME/storages/`，与官方工作区注册表分离；除非主动操作，插件不改动工作区或会话。
- **行规则与官方一致。** 插件只显示主视图当前持有的那一个空白会话，标签为「新会话」；子代理会话挂在父会话表头下；没有工作区归属的会话收进「未分组」，仍然可以打开。
- **归档与恢复。** 归档后该行移出列表，行尾按钮变为「从归档恢复」；视图菜单可切换隐藏、全部、只看已归档三档，选择会被记住。
- **运行中保护。** 会话还有进行中的回合、子代理、后台任务或定时提醒时，先列出并确认，再停止归档。组级确认只处理当时计数到的会话或工作区。
- **组级批量。** 可一次归档组内全部会话或删除组内全部工作区。归档计数只包含实际会归档的会话，已归档、占位和子代理会话不计入；删除计数只包含工作区。
- **右键菜单。** 其他插件已接管的行不再弹菜单，避免两个菜单叠加。
- **折叠状态会保留。** 展开/折叠的选择存 localStorage，刷新后仍会保持。

## 安装

需要 DSH `>= 0.2.2-rc.1`；构建和测试需要 Node.js `>= 22.19.0`。

尚未发布到 npm，从 GitHub 安装：

```sh
dsh plugin --profile <profile> add github:GT-610/dsh-workspace-organize
```

也可以克隆后安装本地目录：

```sh
git clone https://github.com/GT-610/dsh-workspace-organize
dsh plugin --profile <profile> add /path/to/dsh-workspace-organize
```

装好后重启 DSH。`dist/` 随仓库提交，从 git 安装无需放行构建脚本；本地包也可以在「设置 → 插件」里安装。

### 本地开发

```sh
pnpm install
pnpm build       # 改了源码后重建 dist/
```

把仓库链接进 profile 的 `node_modules`：

```sh
# macOS / Linux
ln -s "$PWD" ~/.dsh/profiles/<profile>/node_modules/dsh-workspace-organize
```

```powershell
# Windows
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.dsh\profiles\<profile>\node_modules\dsh-workspace-organize" -Target (Get-Location)
```

之后运行 `pnpm dev`（`tsdown --watch`），改完源码刷新页面。

## 使用

| 想要的效果 | 操作 |
| --- | --- |
| 新建分组 | 标题栏的视图选项按钮 → 新建分组 |
| 重命名 / 解散分组 | 分组行右键或 ⋯ |
| 归档组内全部会话 | 分组行 ⋯ → 归档组内全部会话… |
| 删除组内全部工作区 | 分组行 ⋯ → 删除组内全部工作区… |
| 把工作区移入分组 | 工作区行 ⋯ → 移入分组 → 选分组 |
| 移出分组 | 工作区行 ⋯ → 移出分组（仅在该工作区属于某个分组时出现） |
| 在此工作区新建会话 | 工作区行 ⋯ 或行尾的新建会话按钮 |
| 归档 / 恢复单个会话 | 会话行尾的归档按钮，或右键菜单 |
| 查看已归档会话 | 标题栏的视图选项按钮 → 全部会话(含已归档) / 只看已归档会话 |
| 展开 / 折叠全部 | 标题栏的视图选项按钮 → 展开全部 / 折叠全部 |
| 按标题搜索会话 | 标题栏放大镜 |

## 数据与隐私

- 分组文档只有两份：Host 上的 `$DSH_HOME/storages/workspace-organize-groups.json` 和浏览器 localStorage 镜像；Host 不可达时先写镜像，恢复后以 Host 为准。
- 归档与置顶状态归官方所有，插件只调用官方的归档/恢复操作。
- 写入使用临时文件加 `rename`，串行提交；读接口只监听回环地址，写接口校验 `Sec-Fetch-Site` / `Origin`，两个头都没有的请求按非浏览器调用放行。
- 文档上限为 200 个分组、每组 500 个工作区、全文档 2000 条成员；非法文档整份拒绝，未知字段丢弃，重复成员去重。请求体超过 2 MiB 返回 `413`，JSON 解析或文档校验失败返回 `400`。

## 工作原理

```text
sidebar.workspaces 槽位
  ├─ 官方 WorkspaceBrowser   priority 0（保留注册）
  └─ 本插件 GroupedBrowser   priority -100（接管渲染）
       ├─ 读官方快照、调用官方操作
       └─ 分组文档 ←→ /api/workspace-organize
            └─ $DSH_HOME/storages/workspace-organize-groups.json
```

官方条目留在同一槽位，子槽位因此保留；本插件以更低 priority 接管渲染，业务操作通过 `ctx.get` 惰性解析官方服务。

## 开发

```text
src/index.ts              Host：路由、同源校验、原子存储
src/shared/contract.ts    两侧共用的类型与校验器
src/client/               槽位注册、树与菜单、派生、传输、i18n、样式
tests/                    单元测试与 jsdom 组件测试
```

```sh
pnpm typecheck   # 对官方发布的类型检查
pnpm lint        # oxlint
pnpm test        # vitest
pnpm build       # tsdown → dist/
pnpm check       # 以上四项
```

- `dist/` 提交进仓库，DSH 安装后直接加载；CI 会重建并比对，防止与源码脱节。
- 类型来自官方包，槽位契约漂移会先被 `pnpm typecheck` 拦住。
- 客户端产物是闭包工厂；CSS 全局注入，类名带 `dwo-`；文案走 Client locale 服务。
- 组件测试用 `tests/stubs/primitives.tsx` 替代官方 primitives，因为其 ESM 入口不声明实际运行时依赖。

## 兼容性

- 文案跟随 DSH 语言设置，切换无需刷新。
- 仅提供 web 半边，桌面外壳与浏览器行为一致。
- 与右键菜单插件共存。遮蔽槽位不会渲染官方的会话行子槽位，置顶、分支与复制 ID 等行不会出现在分组树；插件自带归档与重命名行。

## 许可

[MIT](LICENSE)
