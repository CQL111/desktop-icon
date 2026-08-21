// preload.js - 安全 IPC 边界
// 仅暴露白名单 API 到渲染端，绝不直接暴露 ipcRenderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 配置读写
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  saveConfig: (key, value) => ipcRenderer.invoke('save-config', key, value),

  // 行为埋点
  recordInteraction: (style, durationSeconds) =>
    ipcRenderer.invoke('record-interaction', style, durationSeconds),
  manualSwitch: (fromStyle) => ipcRenderer.invoke('manual-switch', fromStyle),

  // 窗口控制
  savePosition: (x, y) => ipcRenderer.invoke('save-position', x, y),
  updateBallPos: (x, y) => ipcRenderer.invoke('update-ball-pos', x, y),
  getScreenInfo: () => ipcRenderer.invoke('get-screen-info'),
  showCard: (style, score, fortuneData, ballX, ballY) =>
    ipcRenderer.invoke('show-card', style, score, fortuneData, ballX, ballY),
  closeCard: () => ipcRenderer.invoke('close-card'),

  // 运势
  drawFortune: (options) => ipcRenderer.invoke('draw-fortune', options),
  getTodayFortune: () => ipcRenderer.invoke('get-today-fortune'),
  showFortuneCard: (style, score, fortuneData, ballX, ballY) =>
    ipcRenderer.invoke('show-fortune-card', style, score, fortuneData, ballX, ballY),
  cardOpened: () => ipcRenderer.invoke('card-opened'),
  cardClosed: (style) => ipcRenderer.invoke('card-closed', style),

  // 事件订阅
  onCardData: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on('card-data', listener);
    return () => ipcRenderer.removeListener('card-data', listener);
  },
  onShortcutDraw: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('shortcut-draw', listener);
    return () => ipcRenderer.removeListener('shortcut-draw', listener);
  },
  onResetBall: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('reset-ball', listener);
    return () => ipcRenderer.removeListener('reset-ball', listener);
  },

  // ---------- AI 设置 ----------
  getAiConfig: () => ipcRenderer.invoke('get-ai-config'),
  saveAiConfig: (payload) => ipcRenderer.invoke('save-ai-config', payload),
  testAiConnection: (payload) => ipcRenderer.invoke('test-ai-connection', payload),
  openSettings: () => ipcRenderer.invoke('open-settings'),

  // ---------- AI 输入浮窗 ----------
  openAiInput: () => ipcRenderer.invoke('open-ai-input'),
  closeAiInput: () => ipcRenderer.invoke('close-ai-input'),
  aiInterpretAsk: (payload) => ipcRenderer.invoke('ai-interpret-ask', payload),

  onAiInputFocus: (handler) => {
    const listener = () => handler();
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

  // ---------- AI 解读增量追加 ----------
  onAiInterpretationReady: (handler) => {
    const listener = (_e, data) => handler(data);
    ipcRenderer.on('ai-interpretation-ready', listener);
    return () => ipcRenderer.removeListener('ai-interpretation-ready', listener);
  },

  // ---------- 日志桥接 ----------
  logInfo:     (scope, msg, meta) => ipcRenderer.send('log-info', scope, msg, meta),
  logWarn:     (scope, msg, meta) => ipcRenderer.send('log-warn', scope, msg, meta),
  logError:    (scope, msg, meta) => ipcRenderer.send('log-error', scope, msg, meta),
  logCritical: (scope, msg, meta) => ipcRenderer.send('log-critical', scope, msg, meta),
});
