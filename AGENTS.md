# 工程交接文档（给下一个 Agent）

> 这是一份给 AI 协作者/开发者的工程速查文档。读完即可理解架构并继续编辑。
> 版本迭代历史见 `CHANGELOG.md`，功能待办见 `feature.md`。

## 一、这是什么（UI 速览）

球窗口 = **团子猫桌宠 + 猫边玻璃面板**：80×80 内联 SVG 团子猫（`.cat`：`.cat-torso` 圆团身体、`.cat-ear` 双耳、`.cat-tail` 绕到右下卷起、`.cat-face` 闭眼弧 + 腮红），脚下 `.pet-glow` 柔光；悬停猫时侧边滑出 `.pet-menu`（四行：图标 + 名称 + 说明，标签常显）。面板默认在右侧、底部对齐向上展开，贴右边缘自动翻到左侧，贴顶部改为向下展开，窄屏压缩成两列。开合由 JS 的 `orbit-open` 闩控制（`ball.js`），避免穿过空隙时闪烁。**情绪用身体语言表达**：`setMood()` 仍写 `#ball-inner[data-mood]`，CSS 通过 `--ink` / `--fur` 控制眼睛弧线、耳朵角度、尾巴幅度与毛色（happy/cry 两组眼睛弧线用 opacity 切换）；毛色跟随 `setColor()` 注入的 `--ball-*`。拖拽时 `.ball.grabbing` 让猫被拎起。**不要再加圆形 `.orb-*` 层**（已移除），也不要再加环绕式小圆点按钮。

**卡片尺寸约定**：卡片窗口固定 380×600（`main.js` 的 `CARD_WIDTH/HEIGHT`），内容区 `#content` 是 `overflow-y:auto`（细滚动条、暗色），操作栏 `.actions` 用 `position:sticky; bottom:0` 吸底，内容超高时按钮仍可见。新增卡片内容不需要再关心高度裁剪，但也别再假设「卡片一定能放下」。

**首次启动协议同意**：`main.js` 的 `AGREEMENT_VERSION` 与 store 的 `consentVersion` 比较，不一致时先开 `src/consent.html`（**不创建球窗口**），同意后 emit `consent-accepted` 再走正常启动；未同意关窗即退出。修改协议内容时把版本 +1。

**法律文档**：源文件在 `docs/legal/*.md`，`npm run build:legal`（已挂在 prebuild）生成 `src/legal-data.js`，设置页「关于」与同意页通过 `open-legal` IPC 打开 `src/legal.html?doc=privacy|terms|disclaimer|thirdparty`。

**两套构建**：`electron-builder.key.yml`（内置 Key，产物 `out/`，自用）、`electron-builder.public.yml`（不带 Key，产物 `out-public/`，公开）、`electron-builder.yml`（默认）。`.gitignore` 只忽略 `build/bundled-ai.json`，`build/entitlements.mac.plist` 需入库。

**关联项目 · 职场搭子（work-companion）**：`C:personalwork-companion` 已独立成新项目，**复制**了本项目的黄历引擎（`src/js/engine/`：astro/lunar/almanac/canon）。两边接口保持一致、只增不改；改动这四个文件时**考虑同步到新项目**。新项目定位是职场决策辅助（「什么时候做」），本项目定位是运势桌宠（娱乐）。新项目文档：`work-companion/AGENTS.md`、`docs/PRODUCT.md`、`docs/ENGINE.md`、`docs/DECISIONS.md`。

**三种 Key 来源**：设置面板 `store.aiConfig.token`（user）/ 本机 `.env`（env）/ 构建内置 `resources/bundled-ai.json`（bundled），由 `onlineConfig.resolve(saved, {preferEnv})` 决定。**开发态（`!app.isPackaged`）传 `preferEnv:true`，`.env` 优先**；发布版默认设置面板优先。构建内置：`npm run build:key`（`scripts/build-bundled-key.js` 生成 `build/bundled-ai.json`，`electron-builder.key.yml` 的 `extraResources` 复制；`/build` 已 gitignore）。

**典籍 RAG（本地检索 + 线上模型）**：`scripts/build-canon-index.js` 把 `data/canon/raw/*.txt` 清洗成 `data/canon/index.json`（周易 64 卦 / 滴天髓 19 篇 / 渊海子平 69 节）；`src/js/canon.js` 做繁简归一（配对串必须去空白）、单字+双字分词、BM25 排序与命中摘录。Agent 新增工具 `search_canon`，system prompt 要求「先检索再引用、引用必须是返回原文、标注出处、检索不到要如实说明」。`runAgent` 返回 `citations`，主进程透传，AI 浮窗渲染可展开的「典籍出处」。原始 txt 被 gitignore，只提交清洗后的 index.json。

**真黄历（离线计算）**：`src/js/astro.js`（Meeus 太阳黄经/朔 → 二十四节气、新月）、`src/js/lunar.js`（冬至月定十一月、无中气置闰、农历日期）、`src/js/almanac.js`（日干支 (JDN+49)%60、月柱五虎遁、建除十二值日、黄黑道、冲煞、彭祖百忌、时辰吉凶、规则宜忌）。`fortune.genAlmanac` 优先用新模块，失败才回退旧近似；返回字段只增不改，卡片与缓存兼容。宜忌是规则参考，卡片底部有免责说明。验证锚点写在 smoke-test：春节、闰二月/闰六月、立春/夏至/冬至、日干支连续性。

**形象专属抽签动画**（`ball.js playDrawAnimation`）：猫/狗走 `fx.js` 粒子动画（蓄力→散开→汇聚）；签筒加 `.ball.shaking`（`.lots-stage` 里放大签筒摇 4 下，2.1s 后 `.stick-out` 签条飞出）；财神加 `.ball.golden`（金色光束 + 星点 + 「财神到」逐字）。专属动画时长通过 `.ball` 上的 `--as`（动画速度倍率）统一缩放，CSS 里所有时长/延迟都写成 `calc(Xs / var(--as, 1))`，JS 等待时间与之一致。抽签时菜单需同时隐藏 `.charging/.vanishing/.shaking/.golden`。

**全应用统一主题**：`src/styles/tokens.css`（深紫夜空 · 暗色玻璃，`--bg-0 #141019`、`--glass-*`、`--text-1/2/3`、`--accent-rose/gold`）。五个窗口 HTML 都在各自样式前引入它；卡片、精灵面板、AI 对话、设置、揭晓卡全部使用同一套 token。新增界面请复用变量，不要再写死颜色。

**硬约束**：猫身热区是主进程 `BALL_HALO=40` 的矩形；面板打开时渲染端必须调用 `window.api.setHitRegion(rect)` 上报「猫 + 面板」窗口内外接矩形（`ball.js reportHitRegion`，主进程换算成屏幕坐标），否则面板点不到；装饰层一律 `pointer-events:none`；动画只能动 `.ball-inner`/SVG 分组，**绝不能动 `.ball` 的 transform**（位置由 `setBallTransform` 写内联 translate）。

## 一、项目是什么

**今日运势 · 桌面悬浮球** —— Windows 桌面 Electron 应用。

一个透明卡通悬浮球常驻桌面：
- 球周围有 4 个签（此刻个人运势 / 今日黄历 / 今日个人运势 / 精灵祈福）
- 点击签 → 弹运势卡片（黄历 + 运势 + 个人 + AI 解读）
- 右键球 → AI 运势对话浮窗
- 养一只"运势精灵"：摆位 + 祈福，给运势维度加"常量"（加持值）
- AI 解读用 DeepSeek（OpenAI 兼容 API），本地可切 Ollama

## 二、技术栈

- **Electron 30.5.1** + **electron-store 8.2.0**（唯一两个依赖）
- 纯 HTML/CSS/原生 JS，无前端框架、无打包器
- 主进程 `net.fetch` 调 AI（无 axios/openai SDK）
- 线上 token 放仓库根目录 `.env`（gitignore），`onlineConfig.js` 启动时读取

## 三、快速上手

```bash
npm install        # 已有 node_modules 可跳过
npm start          # 启动应用
node smoke-test.js # 跑 130 个单元烟雾测试（无需 GUI）
```

- 日志：`%APPDATA%/fortune-ball/logs/main-YYYY-MM-DD.log`
- 配置：`%APPDATA%/fortune-ball/config.json`（electron-store）

## 四、文件结构 + 职责

```
main.js              主进程（~1500 行）：窗口/托盘/快捷键/IPC/持久化/精灵摆位定时器/日志
preload.js           contextBridge 白名单 API（IPC 边界）
smoke-test.js        130 个单元测试（纯 Node，require 各模块验证）

src/
  index.html         球窗口（团子猫 SVG + 猫边菜单 .pet-menu + 状态气泡）
  card.html          运势卡片窗口（所有卡片内容）
  petPanel.html      运势精灵面板（五项加持 + 祈福）
  settings.html      设置面板（模型管理 + 个人信息）
  aiInput.html       AI 对话浮窗

  styles/            ball.css / card.css / petPanel.css / settings.css / aiInput.css

  js/
    ball.js          球渲染：拖拽/点击/签分发/右键/去动画后直接弹卡
    card.js          卡片渲染：5 风格 + 黄历 + 个人 + 精灵加持 + AI 区块
    fortune.js       运势生成核心（主进程跑）：5 风格 + genAlmanac + genProfile + genHourFortune
    fortuneSpirit.js 运势精灵引擎：五项维度加持（摆位积累 + 祈福限次）
    ai.js            LLM 调用封装：callLLM/interpretFortune/interpretAsk/diagnose/testConnection
    localLLM.js      本地 Ollama 探测/列表/下载
    onlineConfig.js  从 `.env` 读 DeepSeek（baseUrl/token/model）
    behavior.js      行为打分：时间衰减 softmax 选风格
    logger.js        结构化日志（4 级 + rotation 5MB×10 + token redact）
    watcher.js       日志 tailer：检测错误 → 触发 AI 诊断
    detector.js      错误模式匹配（auth/rate_limit/network 等）
    selfCheck.js     启动自检（7 项检查）
    rendererLogger.js 渲染端日志桥接 + 全局 error 捕获 + 限速
    settings.js      设置面板逻辑
    petPanel.js      精灵面板逻辑
    aiInput.js       AI 浮窗逻辑

    data/            纯静态数据（require 即得）
      lots.js        签文库
      tarot.js       塔罗 22 张 + 12 星座 + getZodiac()
      yiji.js        宜忌库（宜 88 + 忌 88）
      colors.js      五行颜色 + 幸运色
      persona.js     生肖/天干地支/五行/时区方位 + getShengxiao/getYearGanzhi
      quotes.js      吉言库
      hourGuidance.js 12 时辰提点

CHANGELOG.md        版本迭代历史
feature.md          功能待办清单
README.md           项目说明（略过时，以本文为准）
```

## 五、核心架构

### 5.1 窗口模型（6 个 BrowserWindow）

| 窗口 | 大小 | 特点 |
|---|---|---|
| ballWindow | 全屏透明 | `setIgnoreMouseEvents` 点击穿透，主进程 80ms 光标轮询动态切换 |
| cardWindow | 380×600 | 弹卡片，blur 自动关 |
| petPanelWindow | 340×460 | 精灵面板，blur 自动关 |
| settingsWindow | 460×600 | 设置 |
| aiInputWindow | 380×190 | AI 对话浮窗 |
| （全窗 frameless + transparent + alwaysOnTop + skipTaskbar）|

### 5.2 核心数据流（抽签）

```
用户点签 → ball.js runDrawFlow({scope})
  → drawFortune({scope, deferCard:true})  [IPC]
    → main.js 按 scope 分发：
        moment  → genHourFortune（时辰 + 个人）
        today   → behavior.pickStyle → generate(style) + genAlmanac（黄历）
        profile → genProfile（黄历 + 个人）
        spirit  → 不走这里，ball.js 拦截开面板
    → applyBoost（运势精灵加持叠加到维度分数）
    → 返回 { style, score, fortune }
  → ball.js applyFortune（改球色/表情）
  → showFortuneCard → card.html → card.js render()
```

### 5.3 运势精灵（fortuneSpirit.js）

- 五项维度：综合/爱情/事业/财运/健康
- 五行↔方位：水=综合(左上) 木=事业(右上) 金=财运(左下) 火=爱情(右下) 土=健康(中央)
- 摆位：球停留某方位 5 分钟 → 该维度 +1（上限 2）
- 祈福：主动指定维度 +1（每日限 3 次，总上限 3）
- 测运势时 boosts 叠加到 `dims[字段]`（爱情↔感情 双字段兼容）

### 5.4 AI 链路

- `resolveAiConfig()`：本地优先（store.localModel 且 Ollama 可用），否则 `onlineConfig.resolve(store.aiConfig)` 覆盖 `.env`（设置面板优先，空白回退）
- 旧版 `aiConfig.encryptedToken`（base64）在启动时由 `migrateLegacyAiConfig()` 一次性迁到 `aiConfig.token`
- `tryAppendAiInterpretation()`：抽签后异步追加 AI 解读。**只解读 5 种有 prompt 的风格**（moment/profile 等直接跳过）；缓存按「日期 + 风格 + 加持后分数」存，只能缓存（deferCard）路径才写；本地 Ollama 不写缓存
- **两条抽签路径都要接 AI**：`draw-fortune` 非 deferCard 时内部调用；`show-fortune-card`（球的实际路径）在弹卡后自己调用
- 卡片首次打开时 webContents 还在加载：解读先挂 `cardWindow._pendingAi`，`did-finish-load` 再补发；`card.js` 会校验 payload.style，避免旧解读串到新卡片
- `ai.diagnose()`：日志检测到 error → AI 分析 → 系统通知（只有 critical 才弹通知）

## 六、store 数据结构（electron-store defaults）

```js
{
  position: {x,y},          // 球位置
  zodiac: 'scorpio',        // 星座（save-profile 时由生日推导写入）
  autoStart: false,
  todayFortune: {},         // { dateKey: {style,score,data} } 7天缓存（存原始数据，不加持）
  behavior: {},             // { styleName: {clicks,view_seconds,last_seen} }
  manualSwitchCount: 0,
  aiConfig: { baseUrl, token, model }, // 设置面板填写，覆盖 .env 空白项（token 明文，仅本机）
  localModel: '',           // 用户选的本地 Ollama 模型
  profile: { birthday, gender },
  profileMode: 'comprehensive'|'bazi'|'zodiac',
  profileCache: {},
  momentCache: {}, tomorrowCache: {}, weekCache: {},
  fortuneSpirit: {          // 运势精灵
    boosts: {综合,爱情,事业,财运,健康},
    lastBlessDate, blessCountToday,
    positionWuxing, positionSince,
  },
}
```

## 七、IPC API 清单（preload 暴露的 window.api）

**配置**：`getConfig(key)` / `saveConfig(key,value)`
**运势**：`drawFortune({scope,deferCard})` / `getTodayFortune()` / `showFortuneCard(style,score,data,x,y)` / `cardOpened()` / `cardClosed(style)`
**窗口**：`savePosition(x,y)` / `updateBallPos(x,y)` / `getScreenInfo()` / `showCard(...)` / `closeCard()`
**模型**：`openSettings()` / `getLlmStatus()` / `getLocalModels()` / `setLocalModel(name)` / `pullLocalModel(name)`
**个人**：`saveProfile({birthday,gender})` / `getProfile()` / `setProfileMode(mode)` / `getProfileMode()`
**精灵**：`openPetPanel()` / `getSpirit()` / `blessSpirit(dim)`
**AI**：`openAiInput()` / `closeAiInput()` / `aiInterpretAsk({query, profile})`
**日志**：`logInfo/Warn/Error/Critical(scope,msg,meta)`
**事件订阅**：`onCardData` / `onShortcutDraw(scope)` / `onResetBall` / `onAiInputFocus/Loading/Error` / `onAiInterpretationReady`

## 八、关键约定 & 坑（务必注意）

1. **球位置是浮点**，传给 Electron `setPosition`/`BrowserWindow` 前必须 `Math.round`（否则 `conversion failure`）。已有 `getBallScreenPos()` 统一处理。
2. **高频路径不打日志**：`update-ball-pos`（每帧）、cursor polling（80ms）不记 logger，否则刷爆日志。`update-ball-pos` 用 `ipcMain.handle` 直连（不走 `handle()` 包装），并在 400ms 内合并落盘位置。
3. **线上 token** 只放根目录 `.env`（`DEEPSEEK_API_KEY`）或设置面板（`aiConfig.token`），参考 `.env.example`。`onlineConfig.js` 不进密钥。
4. **AI 失败静默降级**：所有 AI 调用 throw 由上层 catch，卡片仍显示内置内容（离线可用）。
5. **scope 分发**：新增时间维度在 `main.js draw-fortune` 加分支 + `fortune.js` 加生成器 + `card.js` 加 renderer（RENDERERS 表注册）。
6. **运势精灵加持**：在 `main.js applyBoost` 统一应用，**只作用于副本**（`withBoost` 深拷贝缓存数据）！直接改缓存对象会导致每次打开卡片重复加分。`spirit.DIM_FIELDS` 处理"爱情/感情"字段名差异。
7. **每日限次**用本地日期判断（改系统时间可绕过，自用可接受）。精灵相关请统一用 `fortune.getTodayKey()`，不要用 `spirit.getTodayKey()`（后者是 UTC 口径）。
8. **日志 redact**：`logger.js` 自动把 `token/password` 字段打码。
9. **右键 = AI 对话**，精灵面板 = 球上第 4 个签（🔮）。
10. **点击球有全屏抽签动画：`handleClick()` 走 `runDrawFlow({ scope:'today', animate:true })`；具体绘制在 `src/js/fx.js` 的 `window.FX.play()`（球化成粒子 → 炸开 → 汇聚），结束后**直接弹运势卡片**，揭晓动画已合并进卡片入场（`showFortuneCard(..., true)` → `card.js applyRevealStagger()`：标题逐字、内容逐行、卡片扫光）。不再有单独的小揭晓卡（`#resolve` 已移除）。
    - 动画期间球本身不移动（只改 opacity/scale），避免与内联 translate 冲突；
    - FX 用 rAF + `setInterval` 双驱动（窗口被遮挡时 rAF 会被 Chromium 节流），并有超时兜底，任何异常都会复位、不会锁死点击；
    - canvas 的 DPR 上限 1.5、4K 上粒子数降级，避免帧率导致时长被拉长；
    - 暗场衬底决定浅色桌面上粒子是否可见，调低会"看不见动画"。
11. **个人运势缓存 key 必须带日期**：`profile|birthday|mode|YYYY-MM-DD`，否则跨天会返回昨天的结果。
12. **自检里的环境项**（online-token / local-llm / shortcut）标 `optional`，失败只记 warn，不触发 AI 诊断；快捷键被占用属正常情况。

## 九、当前状态

- ✅ 核心功能全部跑通（172 测试全过）
- ✅ 黄历整合 + 个人运势 + 运势精灵完成
- ✅ AI 解读两条抽签路径均已接通；解读不再丢失、不重复叠加、不跨卡片串台
- ⚠️ 截至 2026-11-10 本机 `.env` 与设置面板里的 DeepSeek Key 均返回 401，需到控制台轮换后重新填写
- ⏳ 待办（`feature.md`）：位置调运势、多信息推断、推荐方案、天气位置、分类/一键提升

## 十、改一个功能的典型路径

**示例：加"每日提醒通知"**
1. `main.js` 加定时器 + `Notification`（`app.setAppUserModelId('com.fortune.ball')` 已设）
2. store 加 `reminderTime` 字段
3. 托盘菜单加"提醒时间"子菜单
4. `preload.js` + `settings.js` 加配置入口

**示例：加新运势风格**
1. `fortune.js` 加 `genXxx(rng, ctx)` + `generate()` 的 switch + `STYLE_LABELS`
2. `behavior.js` 的 `STYLES` 数组加 key
3. `card.js` 加 `renderXxx` + `RENDERERS` 注册
4. `smoke-test.js` 加结构断言
