# 今日运势 · 桌面桌宠

> 图文使用说明：打开 [`docs/usage-guide.html`](docs/usage-guide.html)（单文件，截图已内嵌，可直接分享）。

Windows 桌面常驻的透明卡通悬浮球（Electron）。hover 出 4 个签测算运势，养一只会加持分数的精灵，卡片和对话可以用线上或本地大模型做解读。

当前版本：`1.0.1`（见 `package.json`）。

## 它能做什么

- **悬浮球**：全屏透明、点击穿透桌面；表情随运势变（大笑 / 微笑 / 不笑 / 哭）；拖拽，位置会记住。
- **4 个签**（hover 球出现）：
  - ⏰ 此刻个人运势（时辰吉言 + 宜忌，有生日则带个人摘要）
  - 📅 今日黄历（干支年、生肖、宜忌、幸运色/数字 + 当日运势）
  - 👤 今日个人运势（需在设置里填生日：综合 / 八字 / 星座）
  - 🔮 精灵祈福（打开精灵面板，不走抽签）
- **运势精灵**：综合 / 爱情 / 事业 / 财运 / 健康。球在对应方位停约 5 分钟自动 +1；也可主动祈福（每日 3 次）。测运势时加持叠到维度分数上。
- **AI 解读**：抽签卡片底部异步追加解读，失败不影响内置内容。
- **AI 对话**：右键球打开多轮浮窗。默认走个人测算 tools（黄历、时辰、今日运势、命理、精灵等）。说到「按生日分组」这类临时业务时，会额外挂上分组 tool。
- **系统托盘**：显示/隐藏、抽一签、黄历测算（含明日/本周）、AI 解读、设置、开机自启、打开日志目录、退出。
- **快捷键**：`Ctrl+Alt+F` 抽签（今日）。
- **开机自启**：仅安装包（packaged）模式生效；`npm start` 开发态不注册自启。

## 环境要求

- Windows 10/11（主要目标；另有 mac/linux 的 builder 脚本，未作为日常验证）
- Node.js 18+（能跑 Electron 30 即可）
- 可选：本机 [Ollama](https://ollama.com/)（用本地模型时）

## 配置 API（线上模型）

**三种 Key 来源，优先级从高到低：**

| 来源 | 适用场景 | 怎么配置 |
|---|---|---|
| 本机 `.env`（开发态优先） | 开发者 `npm start` | 复制 `.env.example` 为 `.env` 并填 `DEEPSEEK_API_KEY` |
| 设置面板（发布版优先） | 终端用户 / 想换自己的 Key | 托盘 → 设置 → 线上模型 |
| 构建时内置 | 发布版开箱即用 | `npm run build:key`（用本地 .env 生成内置 Key 并打包） |

- `npm start`：**自动读取本机 `.env`**，无需在界面里填；开发态下 `.env` 优先于之前保存的 Key
- `npm run build` / `build:local`：不内置 Key，用户需自行填写
- `npm run build:key`：把 `.env` 里的 Key 打进安装包（`resources/bundled-ai.json`），用户安装后即可用；仍可在设置里覆盖
- 发布版优先级：设置面板 > 内置 Key（`.env` 通常不存在）

> ⚠️ 内置 Key 会随安装包分发，任何人解包都能拿到。只建议用于内测或自用；公开分发请改用服务端代理 + 配额。


密钥**不要**写进源码。两种方式，设置面板优先，空白再读 `.env`。

### 1. 设置面板（推荐给最终用户）

启动应用 → 托盘 → **设置** → **线上模型**：

| 字段 | 示例 |
|---|---|
| Base URL | `https://api.deepseek.com/v1` |
| 模型名 | `deepseek-chat` |
| API Key | 服务商控制台复制的 key |

保存后可点「测试连接」。Key 只存在本机 `%APPDATA%/fortune-ball/config.json`，界面只显示打码后的片段。已保存的 Key 再保存时留空 = 不修改。

选了本地 Ollama 模型时，会优先走本机，不走线上。

### 2. 开发用 `.env`

```bash
copy .env.example .env
```

编辑 `.env`（此文件已被 gitignore）：

```
DEEPSEEK_API_KEY=你的key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

发布 GitHub Release 时才需要再加 `GH_TOKEN`（electron-builder）。

兼容任意 OpenAI 协议的 Chat Completions 端点：把 Base URL 和模型名改成对应服务即可。

## 启动

```bash
npm install
npm start              # 开发启动（electron .）
npm run start:hidden   # 启动但不显示球（给开机自启预留，开发调试用）
```

第一次应看到粉色悬浮球。没有配 Key 时，内置黄历/抽签仍可用，AI 解读和对话会失败或提示去设置。

| 脚本 | 作用 |
|---|---|
| `npm start` | 开发运行 |
| `npm run start:hidden` | `electron . --hidden` |
| `node smoke-test.js` | 纯 Node 单元烟雾测试，不需要弹出 GUI |

配置与日志（Windows）：

- 配置：`%APPDATA%/fortune-ball/config.json`
- 日志：`%APPDATA%/fortune-ball/logs/main-YYYY-MM-DD.log`

## 测试

```bash
node smoke-test.js
```

覆盖运势生成、精灵加持、agent tools / 场景注册、`.env` 不进源码等。改测算或 agent 后应先跑这一条。

## 打包（Build）

产物在 `release/`（已 gitignore；`dist/` 保留给旧产物）。打包会自动带应用图标，并只收录运行所需文件（`.env`、源码文档、脚本不会进包）。

| 命令 | 作用 |
|---|---|
| `npm run build:key` | **推荐**：用本地 `.env` 的 Key 内置进安装包（`resources/bundled-ai.json`），用户装完即用 |
| `npm run build:local` | 不内置 Key，用户自行在设置里填 |
| `npm run build:key:check` | 只检查 `.env` 是否可用，不打包 |

> 打不开/文件被占用时：先退出所有 `fortune-ball.exe` / `electron.exe` 进程；若 `release` 被编辑器索引占用，换一个输出目录或重启编辑器即可。
> 国内网络下载 NSIS 工具失败时，可加镜像：`ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。

内置 Key 的安装包 ≈73MB；公开分发前请确认合规要求（见上方 Key 说明）。

## 发布到 GitHub Release

`electron-builder.yml` 指向仓库 `CQL111/desktop-icon`。需要 GitHub Token（`repo` 权限）写在 `.env` 的 `GH_TOKEN=`。

```bash
npm run release:patch  # 升 patch、打 tag、push、构建并 publish
npm run release:minor
npm run release:major
npm run release        # 用当前 package.json 版本打 tag 再发布（该 tag 不能已存在）
```

`scripts/build.js` 是「已有 GH_TOKEN、直接 `publish always`」的捷径，一般用上面的 `release:*` 即可。

## 项目结构

```
main.js                 主进程：窗口 / 托盘 / IPC / 持久化 / 精灵定时器 / 日志
preload.js              contextBridge 白名单
smoke-test.js           单元烟雾测试
electron-builder.yml    打包与 GitHub 发布
scripts/build.js        带 GH_TOKEN 的发布构建
scripts/release.js      升版本 + tag + 构建发布
.env.example            环境变量模板（复制为 .env）
src/
  index.html            球
  card.html             运势卡片
  petPanel.html         精灵面板
  settings.html         设置（线上模型 + Ollama + 个人信息）
  aiInput.html          AI 多轮对话
  js/
    fortune.js          运势生成
    fortuneSpirit.js    精灵加持
    agent.js            对话循环
    scenarios/          临时业务场景注册表（如按生日分组）
    ai.js               LLM 调用
    onlineConfig.js     从 .env 读默认线上配置
    localLLM.js         Ollama
    ...
  js/data/              签文 / 塔罗 / 宜忌 / 生肖干支 等静态数据
```

更细的数据流、IPC、坑见 **`AGENTS.md`**。版本记录见 **`CHANGELOG.md`**。

## 技术栈

- Electron 30 + electron-store（运行时几乎只有这一对依赖）
- 无前端框架、无打包器；主进程 `net.fetch` 调模型

## 已知约束

- 托盘图标可换成 `src/assets/tray.png`
- 黄历是干支 + 宜忌，不是精确农历
- 设置里的 API Key 在本机配置文件中为明文（仅本用户目录）
- 历史 git 里若出现过 Key，需要在服务商控制台轮换，单靠 `.env` 清不掉旧 commit
