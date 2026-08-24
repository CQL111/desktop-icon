# 今日运势 · 桌面悬浮球

Electron 桌面应用：透明可拖动悬浮球，点击弹出今日运势卡片。基于用户行为自动选择 5 种运势风格。

## 快速开始

```bash
npm install
npm start
```

启动后屏幕右下角会出现一个粉色卡通悬浮球。点击它抽签。拖动它换位置（关闭后重启仍在原位置）。

## 功能

- **悬浮球**：透明 + 圆角阴影 + 3 种表情（开心/一般/不开心），表情随今日运势变化
- **拖拽**：鼠标按住拖动到屏幕任意位置；关闭后位置记忆
- **5 种运势风格**：传统中式 / 现代简洁 / 趣味抽签 / 星座塔罗 / 个性化推荐
- **自动切换**：基于点击次数 + 阅读时长 + 14 天时间衰减 + softmax 探索的混合打分
- **系统托盘**：右键菜单（显示/隐藏、抽一签、开机自启、重置位置、退出）
- **全局快捷键**：`Ctrl+Alt+F` 唤起并抽签
- **每日缓存**：同一日多次打开看到同一份运势，跨重启保持一致
- **开机自启**：仅在 packaged 模式生效（dev 模式不污染注册表）

## 验证

```bash
node smoke-test.js
```

跑 51 个单元烟雾测试，覆盖行为打分、时间衰减、softmax、5 种运势生成、seeded 一致性等。

## 手动验证清单

1. `npm start` → 球出现在主屏右下角
2. 拖动球到屏幕其他位置 → 关闭（点 X）→ 重启 → 位置仍在
3. 点击球 → 卡片展开，看运势
6. 右键托盘 → 退出 → app 真正退出（不再出现在托盘）
7. 关掉所有窗口 → app 仍在托盘运行
8. `Ctrl+Alt+F` → 球出现

## 项目结构

```
├── main.js              主进程：窗口/托盘/单实例锁/IPC/持久化
├── preload.js           contextBridge 白名单 API
├── smoke-test.js        单元烟雾测试
├── src/
│   ├── index.html       球窗口
│   ├── card.html        运势卡片窗口
│   ├── styles/          ball.css + card.css
│   └── js/
│       ├── ball.js      球渲染：拖拽/点击/表情
│       ├── card.js      卡片渲染：5 种风格分发
│       ├── behavior.js  行为打分 + softmax
│       ├── fortune.js   运势生成（主进程用）
│       └── data/        签文/塔罗/宜忌/颜色
```

## 已知约束

- 托盘图标暂用空 image（在 Windows 上显示为空白小图标），用户可替换 `src/assets/tray.png` 为真实 ICO
- 表情用 inline SVG，暂未做 PNG 资源
- 个性化推荐在交互 < 10 次时退化为现代简洁风格
- 启动自启仅在 `app.isPackaged` 为 true 时写入注册表（避免 dev 模式污染）

## 打包（可选）

```bash
npm install -D electron-builder
# 配置 electron-builder 后
npx electron-builder --win
```
