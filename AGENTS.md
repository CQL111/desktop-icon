# 工程交接文档（给下一个 Agent）

> 这是一份给 AI 协作者/开发者的工程速查文档。读完即可理解架构并继续编辑。
> 版本迭代历史见 `CHANGELOG.md`，功能待办见 `feature.md`。

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
- `safeStorage` 已废弃（token 硬编码），用 `electron-log` 式自研 logger

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
  index.html         球窗口（4 个 sign-chip + 表情 SVG + 气泡）
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
    onlineConfig.js  DeepSeek 硬编码配置（baseUrl/token/model）
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

- `resolveAiConfig()`：本地优先（store.localModel 且 Ollama 可用），否则硬编码 DeepSeek
- `tryAppendAiInterpretation()`：抽签后异步追加 AI 解读（缓存命中直接发）
- `ai.diagnose()`：日志检测到 error → AI 分析 → 系统通知

## 六、store 数据结构（electron-store defaults）

```js
{
  position: {x,y},          // 球位置
  zodiac: 'scorpio',        // 星座（save-profile 时由生日推导写入）
  autoStart: false,
  todayFortune: {},         // { dateKey: {style,score,data} } 7天缓存
  behavior: {},             // { styleName: {clicks,view_seconds,last_seen} }
  manualSwitchCount: 0,
  aiConfig: {...},          // 已废弃（token 硬编码，不再读）
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
2. **高频路径不打日志**：`update-ball-pos`（每帧）、cursor polling（80ms）不记 logger，否则刷爆日志。
3. **token 硬编码**在 `onlineConfig.js`（自用工具，用户明确要求）。改线上模型改这里。
4. **AI 失败静默降级**：所有 AI 调用 throw 由上层 catch，卡片仍显示内置内容（离线可用）。
5. **scope 分发**：新增时间维度在 `main.js draw-fortune` 加分支 + `fortune.js` 加生成器 + `card.js` 加 renderer（RENDERERS 表注册）。
6. **运势精灵加持**：在 `main.js applyBoost` 统一应用，`spirit.DIM_FIELDS` 处理"爱情/感情"字段名差异。
7. **每日限次**用本地日期判断（改系统时间可绕过，自用可接受）。
8. **日志 redact**：`logger.js` 自动把 `token/password` 字段打码。
9. **右键 = AI 对话**，精灵面板 = 球上第 4 个签（🔮）。
10. **抽签已去动画**：`runDrawFlow` 直接弹卡（`playBounceAnimation`/`playExplodeEffect` 已不调用）。

## 九、当前状态

- ✅ 核心功能全部跑通（130 测试全过）
- ✅ 黄历整合 + 个人运势 + 运势精灵完成
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
