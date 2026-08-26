// scripts/build.js
const { execSync } = require('child_process');
require('dotenv').config();

if (!process.env.GH_TOKEN) {
  console.error('❌ 错误: 未在 .env 文件中找到 GH_TOKEN，请检查配置！');
  process.exit(1);
}

console.log('🔍 已开启调试模式，开始构建...');

// ✅ 正确做法：去掉 --debug，改为在 env 中注入 DEBUG 变量
execSync('electron-builder --win --publish onTag', { 
  stdio: 'inherit',
  env: { 
    ...process.env, 
    DEBUG: 'electron-builder' // 这才是正确的调试开关
  }
});