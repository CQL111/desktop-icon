// preload.js - 安全 IPC 边界
// 仅暴露白名单 API 到渲染端，绝不直接暴露 ipcRenderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 配置读写
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  // 桌面形象：cat | dog | caishen | lots
  getStreak: () => ipcRenderer.invoke('get-streak'),
  getPersona: () => ipcRenderer.invoke('get-persona'),
  setPersona: (name) => ipcRenderer.invoke('set-persona', name),
  saveConfig: (key, value) => ipcRenderer.invoke('save-config', key, value),

  // 行为埋点
  recordInteraction: (style, durationSeconds) =>
    ipcRenderer.invoke('record-interaction', style, durationSeconds),
  manualSwitch: (fromStyle) => ipcRenderer.invoke('manual-switch', fromStyle),

  // 窗口控制
  savePosition: (x, y) => ipcRenderer.invoke('save-position', x, y),
  updateBallPos: (x, y) => ipcRenderer.invoke('update-ball-pos', x, y),
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  // 面板打开时上报「猫 + 菜单」的外接矩形，主进程据此扩大点击穿透热区
  setHitRegion: (rect) => ipcRenderer.send('set-hit-region', rect),
  showCard: (style, score, fortuneData, ballX, ballY) =>
    ipcRenderer.invoke('show-card', style, score, fortuneData, ballX, ballY),
  closeCard: () => ipcRenderer.invoke('close-card'),

  // 运势
  drawFortune: (options) => ipcRenderer.invoke('draw-fortune', options),
  getTodayFortune: () => ipcRenderer.invoke('get-today-fortune'),
  showFortuneCard: (style, score, fortuneData, ballX, ballY, reveal) =>
    ipcRenderer.invoke('show-fortune-card', style, score, fortuneData, ballX, ballY, !!reveal),
  cardOpened: () => ipcRenderer.invoke('card-opened'),
  cardClosed: (style) => ipcRenderer.invoke('card-closed', style),

  // 事件订阅
  onCardData: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on('card-data', listener);
    return () => ipcRenderer.removeListener('card-data', listener);
  },
  onShortcutDraw: (handler) => {
    const listener = (_e, scope) => handler(scope);
    ipcRenderer.on('shortcut-draw', listener);
    return () => ipcRenderer.removeListener('shortcut-draw', listener);
  },
  onResetBall: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('reset-ball', listener);
    return () => ipcRenderer.removeListener('reset-ball', listener);
  },
  onPersonaChanged: (handler) => {
    const listener = (_e, name) => handler(name);
    ipcRenderer.on('persona-changed', listener);
    return () => ipcRenderer.removeListener('persona-changed', listener);
  },
  onSpiritBoosted: (handler) => {
    const listener = (_e, info) => handler(info);
    ipcRenderer.on('spirit-boosted', listener);
    return () => ipcRenderer.removeListener('spirit-boosted', listener);
  },
  onStreakUpdated: (handler) => {
    const listener = (_e, info) => handler(info);
    ipcRenderer.on('streak-updated', listener);
    return () => ipcRenderer.removeListener('streak-updated', listener);
  },

  // ---------- 设置 / 动画 ----------
  openSettings: () => ipcRenderer.invoke('open-settings'),
  openLegal: (key) => ipcRenderer.invoke('open-legal', key),
  acceptConsent: () => ipcRenderer.invoke('accept-consent'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  previewBallAnim: () => ipcRenderer.invoke('preview-ball-anim'),

  // ---------- 模型管理 ----------
  getLlmStatus: () => ipcRenderer.invoke('get-llm-status'),
  getOnlineAiConfig: () => ipcRenderer.invoke('get-online-ai-config'),
  saveOnlineAiConfig: (payload) => ipcRenderer.invoke('save-online-ai-config', payload),
  clearOnlineAiToken: () => ipcRenderer.invoke('clear-online-ai-token'),
  testOnlineAi: () => ipcRenderer.invoke('test-online-ai'),
  getLocalModels: () => ipcRenderer.invoke('get-local-models'),
  setLocalModel: (name) => ipcRenderer.invoke('set-local-model', name),
  pullLocalModel: (name) => ipcRenderer.invoke('pull-local-model', name),

  // ---------- 个人测算 ----------
  saveProfile: (profile) => ipcRenderer.invoke('save-profile', profile),
  getProfile: () => ipcRenderer.invoke('get-profile'),
  setProfileMode: (mode) => ipcRenderer.invoke('set-profile-mode', mode),
  getProfileMode: () => ipcRenderer.invoke('get-profile-mode'),

  // ---------- 运势精灵 ----------
  openPetPanel: () => ipcRenderer.invoke('open-pet-panel'),
  getSpirit: () => ipcRenderer.invoke('get-spirit'),
  blessSpirit: (dim) => ipcRenderer.invoke('bless-spirit', dim),

  // ---------- AI 输入浮窗 ----------
  openAiInput: () => ipcRenderer.invoke('open-ai-input'),
  closeAiInput: () => ipcRenderer.invoke('close-ai-input'),
  aiInterpretAsk: (payload) => ipcRenderer.invoke('ai-interpret-ask', payload),
  resetAgentChat: () => ipcRenderer.invoke('reset-agent-chat'),

  onAiInputFocus: (handler) => {
    const listener = (_e, data) => handler(data || {});
    ipcRenderer.on('ai-input-focus', listener);
    return () => ipcRenderer.removeListener('ai-input-focus', listener);
  },
  onAiInputLoading: (handler) => {
    const listener = (_e, loading) => handler(loading);
    ipcRenderer.on('ai-input-loading', listener);
    return () => ipcRenderer.removeListener('ai-input-loading', listener);
  },
  onAiInputError: (handler) => {
    const listener = (_e, err) => handler(err);
    ipcRenderer.on('ai-input-error', listener);
    return () => ipcRenderer.removeListener('ai-input-error', listener);
  },
  onAgentProgress: (handler) => {
    const listener = (_e, info) => handler(info);
    ipcRenderer.on('ai-agent-progress', listener);
    return () => ipcRenderer.removeListener('ai-agent-progress', listener);
  },

  // ---------- AI 解读增量追加 ----------
  onAiInterpretationReady: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on('ai-interpretation-ready', listener);
    return () => ipcRenderer.removeListener('ai-interpretation-ready', listener);
  },

  // AI 不可用时的卡片提示（无 Key / Key 失效）
  onAiStatus: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on('ai-status', listener);
    return () => ipcRenderer.removeListener('ai-status', listener);
  },

  // ---------- 日志桥接 ----------
  logInfo:     (scope, msg, meta) => ipcRenderer.send('log-info', scope, msg, meta),
  logWarn:     (scope, msg, meta) => ipcRenderer.send('log-warn', scope, msg, meta),
  logError:    (scope, msg, meta) => ipcRenderer.send('log-error', scope, msg, meta),
  logCritical: (scope, msg, meta) => ipcRenderer.send('log-critical', scope, msg, meta),
});
