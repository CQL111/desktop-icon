// onlineConfig.js - 线上模型硬编码配置（用户无感知）
// DeepSeek 的 API 直接内置，用户无需在设置面板填任何线上配置
// ⚠️ token 硬编码会进代码/git；自用工具可接受，分发/开源前需改环境变量

module.exports = {
  baseUrl: 'https://api.deepseek.com/v1',
  token: 'sk-dae53c5d64184c49aef05df6cb6b8be0',
  model: 'deepseek-chat',
};