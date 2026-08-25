# 今日运势 · 桌面悬浮球

Windows 桌面 Electron 应用：一个透明卡通悬浮球，点击测算今日运势，养一只会加持运势的精灵，结合 AI（DeepSeek）生成个性化解读。

## 快速开始

```bash
npm install
npm start          # 启动应用
node smoke-test.js # 130 个单元烟雾测试（无需 GUI）
```

启动后屏幕出现粉色悬浮球。hover 球出现 4 个签；点击签弹运势卡片；右键球打开 AI 对话。

## 功能

- **悬浮球**：透明 + 表情随运势变化（大笑/微笑/不笑/哭），拖拽 + 位置记忆
- **4 个签**：此刻个人运势 ⏰ / 今日黄历 📅 / 今日个人运势 👤 / 精灵祈福 🔮
- **今日黄历**：干支年 + 生肖 + 宜忌 + 幸运色/数字 + 运势评分
- **今日个人运势**：黄历 + 个人基础信息（生日/性别/时区 → 生肖/星座/五行）
- **运势精灵**：五项维度加持（摆位积累 + 祈福），叠加到运势分数
- **AI 解读**：DeepSeek（硬编码，无感）+ 本地 Ollama 可选，卡片底部异步追加
- **系统托盘**：显示/隐藏、抽一签、黄历测算、AI 解读、设置、自启、日志、退出
- **全局快捷键**：`Ctrl+Alt+F` 唤起抽签
- **开机自启**：仅 packaged 模式生效

## 文档

- **`AGENTS.md`** — 工程交接文档（架构/文件/数据流/IPC/坑），给协作者/下一个 Agent
- **`CHANGELOG.md`** — 版本迭代历史
- **`feature.md`** — 功能待办

## 项目结构

```
├── main.js              主进程：窗口/托盘/IPC/持久化/精灵摆位定时器/日志
├── preload.js           contextBridge 白名单 API
├── smoke-test.js        130 个单元测试
├── AGENTS.md            工程交接文档
├── CHANGELOG.md         版本迭代
├── src/
│   ├── index.html       球窗口（4 签）
│   ├── card.html        运势卡片
│   ├── petPanel.html    精灵面板
│   ├── settings.html    设置
│   ├── aiInput.html     AI 对话浮窗
│   ├── styles/          ball/card/petPanel/settings/aiInput.css
│   └── js/
│       ├── ball.js      球渲染
│       ├── card.js      卡片渲染
│       ├── fortune.js   运势生成（5风格+黄历+个人+时辰）
│       ├── fortuneSpirit.js 运势精灵引擎
│       ├── ai.js        LLM 调用
│       ├── behavior.js  行为打分
│       ├── logger.js    结构化日志
│       └── data/        静态数据（签文/塔罗/宜忌/生肖/干支）
```

## 已知约束

- 托盘图标暂用空 image（`src/assets/tray.png` 可替换）
- 黄历暂用干支 + 宜忌（精确农历后期迭代）
- 线上 token 硬编码在 `onlineConfig.js`（自用）
- 打包：`npm install -D electron-builder` 后 `npx electron-builder --win`
