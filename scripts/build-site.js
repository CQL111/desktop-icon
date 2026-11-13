// 把 product-intro.html 发布为 GitHub Pages 站点首页。
// Pages 源设为 master 分支的 /docs 目录，所以产物是 docs/index.html。
// 用法: npm run build:site
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'product-intro.html');
const outDir = path.join(root, 'docs');
const out = path.join(outDir, 'index.html');

if (!fs.existsSync(src)) {
  console.error('❌ 找不到 product-intro.html');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, out);

// 关掉 Jekyll 处理，避免下划线开头的文件被忽略，也省一次构建
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`✅ 已生成 docs/index.html (${kb} KB)`);
console.log('   Pages: https://cql111.github.io/desktop-icon/');
