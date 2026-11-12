const { execSync } = require('child_process');
require('dotenv').config();

if (!process.env.GH_TOKEN) {
  console.error('❌ 缺少 GH_TOKEN');
  process.exit(1);
}

console.log('🔑 GH_TOKEN:', `${process.env.GH_TOKEN.substring(0, 8)}...`);
console.log('🚀 开始构建并发布 (publish=always)...');

// ⭐ 关键改动：onTag → always
const path = require('path');
const withKey = fs.existsSync(path.resolve(__dirname, '../build/bundled-ai.json'));
const cfgArg = withKey ? ' --config electron-builder.key.yml' : '';
execSync('electron-builder --win --publish always' + cfgArg, { 
  stdio: 'inherit',
  env: { ...process.env, DEBUG: 'electron-builder' }
});