const { execSync } = require('child_process');
require('dotenv').config();

// 支持通过参数指定版本类型: npm run release -- patch/minor/major
// 默认不传参则使用当前 package.json 中的版本
const arg = process.argv[2]; 
const validTypes = ['patch', 'minor', 'major'];

console.log('🔍 检查版本状态...');

if (arg && validTypes.includes(arg)) {
  // 【自动升级模式】
  console.log(`⬆️ 自动升级版本 (${arg}) 并提交 Tag...`);
  // npm version 会自动: 1.改package.json 2.git commit 3.git tag
  // -m 参数自定义 commit message，%s 会被替换为新版本号
  execSync(`npm version ${arg} -m "chore(release): bump version to %s"`, { stdio: 'inherit' });
} else {
  // 【手动版本模式】使用 package.json 中现有的版本
  const fs = require('fs');
  const path = require('path');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
  const tagName = `v${pkg.version}`;
  
  console.log(`📦 使用现有版本: ${tagName}`);
  
  // 检查本地是否已有该 Tag（防止重复构建同版本）
  try {
    execSync(`git rev-parse ${tagName}`, { stdio: 'ignore' });
    console.error(`❌ Tag ${tagName} 已存在于本地！`);
    console.error(`💡 提示: 运行 "npm run release -- patch" 来自动升级版本`);
    process.exit(1);
  } catch (e) {
    // Tag 不存在，确保工作区干净后打 Tag
    execSync('git add -A', { stdio: 'ignore' });
    try {
      execSync(`git commit -m "chore(release): prepare ${tagName}"`, { stdio: 'ignore' });
    } catch (_) { /* 无变更则跳过 */ }
    execSync(`git tag ${tagName}`, { stdio: 'inherit' });
  }
}

// 推送代码和 Tag 到远程
console.log('📤 推送到远程仓库...');
execSync('git push origin HEAD --tags', { stdio: 'inherit' });

// 触发 electron-builder 构建并发布
console.log('🚀 开始构建并发布到 GitHub...');
execSync('electron-builder --win --publish always', { 
  stdio: 'inherit',
  env: { ...process.env }
});

console.log('✅ 发布流程完成！');