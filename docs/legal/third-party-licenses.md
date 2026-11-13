# 第三方与开源许可

**最后更新：2026-11-13**

## 一、本应用自身

本应用源代码采用 **MIT License** 发布。

```
MIT License

Copyright (c) 2026 CQL111

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 二、运行时依赖

| 包 | 版本 | 许可证 |
|---|---|---|
| electron-store | ^8.2.0 | MIT |

## 三、构建依赖

| 包 | 版本 | 许可证 |
|---|---|---|
| dotenv | ^17.4.2 | BSD-2-Clause |
| electron | ^30.5.1 | MIT |
| electron-builder | ^26.15.3 | MIT |
| rimraf | ^6.1.3 | BlueOak-1.0.0 |
| standard-version | ^9.5.0 | ISC |

## 四、文化内容

| 内容 | 来源 | 许可 |
|---|---|---|
| 周易、滴天髓、渊海子平原文 | 维基文库（经 mingli 镜像） | 原文公版；数字文本 CC BY-SA 4.0 |
| 黄历算法（农历/节气） | 本应用基于 Meeus《Astronomical Algorithms》公式实现 | 本应用自有实现 |
| 签文、宜忌词库、塔罗牌义 | 本应用整理 | MIT |
| 应用图标、桌宠形象 | 本应用原创 | 归开发者所有 |

> CC BY-SA 4.0 要求：转载典籍数字文本时需注明来源与许可，并以相同方式共享。

## 五、字体

应用优先使用系统中文字体（Microsoft YaHei / PingFang SC / 楷体 / 宋体等），不内嵌字体文件，因此不涉及字体许可问题。

## 六、如何查看完整许可证文本

安装后各依赖的完整许可证文本位于 `node_modules/<包名>/LICENSE`（源码运行时）或安装目录的 `resources/app.asar` 内。
