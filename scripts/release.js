// scripts/release.js - 升版本 → 推送 → 构建公开版与内置 Key 版 → 发布到同一个 GitHub Release
// 用法：
//   npm run release:patch|minor|major   # 升版本、提交、打 tag、构建并发布
//   npm run release                     # 用 package.json 现有版本（tag 不能已存在）
//
// 两个版本分别产出不同资产名（见 electron-builder*.yml 的 artifactName）：
//   fortune-ball-public.Setup.X.Y.Z.exe  公开版，不带 Key
//   fortune-ball.Setup.X.Y.Z.exe         内置 Key 版，开箱即用
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');
const arg = process.argv[2];
const validTypes = ['patch', 'minor', 'major'];

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: { ...process.env } });
}

console.log('🔍 检查版本状态...');

if (arg && validTypes.includes(arg)) {
  console.log(`⬆️ 自动升级版本 (${arg}) 并提交 Tag...`);
  // npm version 会自动: 1.改 package.json 2.git commit 3.git tag
  run(`npm version ${arg} -m "chore(release): bump version to %s"`);
} else {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  const tagName = `v${pkg.version}`;
  console.log(`📦 使用现有版本: ${tagName}`);
  // 检查本地是否已有该 Tag（防止重复构建同版本）
  try {
    execSync(`git rev-parse ${tagName}`, { stdio: 'ignore', cwd: ROOT });
    console.error(`❌ Tag ${tagName} 已存在于本地！`);
    console.error('💡 提示: 运行 "npm run release:patch" 来自动升级版本');
    process.exit(1);
  } catch {
    run('git add -A');
    try {
      execSync(`git commit -m "chore(release): prepare ${tagName}"`, { stdio: 'ignore', cwd: ROOT });
    } catch { /* 无变更则跳过 */ }
    run(`git tag ${tagName}`);
  }
}

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version;
console.log(`📦 目标版本: v${version}`);

console.log('📤 推送到远程仓库...');
run('git push origin HEAD --tags');

console.log('🚀 构建公开版并上传...');
run('electron-builder --win --publish always --config electron-builder.public.yml');

// 内置 Key 版：只有本地生成了 bundled-ai.json 才会构建
if (fs.existsSync(path.join(ROOT, 'build/bundled-ai.json'))) {
  console.log('🚀 构建内置 Key 版并上传（同一 Release）...');
  run('electron-builder --win --publish always --config electron-builder.key.yml');
} else {
  console.log('⏭️ 未找到 build/bundled-ai.json，跳过内置 Key 版（可先 npm run build:key:check）');
}

console.log('✅ 发布完成：');
console.log(`   https://github.com/CQL111/desktop-icon/releases/tag/v${version}`);
