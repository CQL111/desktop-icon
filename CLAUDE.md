# CLAUDE.md

本项目的完整工程说明见 **[AGENTS.md](./AGENTS.md)**。

## 项目速览

- **产品**：今日运势 · 桌面桌宠（fortune-ball）— Windows 桌面悬浮球 / 团子猫，看今日运势与黄历
- **核心资产**：真黄历引擎（`astro/lunar/almanac`）、典籍 RAG（`canon.js`）、桌宠 UI、Agent 工具调用
- **版本**：1.2.0（已发布 GitHub Release）

## 关联项目

**职场搭子（work-companion）** 已独立成新项目：`C:\personal\work-companion`

- 新项目**复制**了本项目的黄历引擎（`src/js/engine/`），两边接口保持一致、只增不改
- 新项目定位是**职场决策辅助**（「什么时候做」），本项目定位是**运势桌宠**（娱乐）
- 若修改了本项目的 `src/js/astro.js` / `lunar.js` / `almanac.js` / `canon.js`，**考虑是否需要同步到新项目**
- 新项目的文档：`work-companion/AGENTS.md`、`docs/PRODUCT.md`、`docs/ENGINE.md`

## 文档索引

| 文档 | 用途 |
|---|---|
| `AGENTS.md` | 工程全貌（先读这个） |
| `README.md` | 项目说明与构建方式 |
| `CHANGELOG.md` | 版本迭代 |
| `docs/usage-guide.html` | 图文使用说明（截图内嵌） |
| `docs/legal/` | 隐私政策、用户协议、免责声明、第三方许可 |
| `electron-builder*.yml` | 公开版 / 个人版构建配置 |
