// main.js - 主进程
// 桌面悬浮球 - 今日运势
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage, Notification, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const behavior = require('./src/js/behavior');
const fortune = require('./src/js/fortune');
const ai = require('./src/js/ai');
const logger = require('./src/js/logger');
const LogWatcher = require('./src/js/watcher');
const selfCheck = require('./src/js/selfCheck');
const localLLM = require('./src/js/localLLM');
const onlineConfig = require('./src/js/onlineConfig');

// Windows 通知必须先设 appId（在 ready 之前）
app.setAppUserModelId('com.fortune.ball');

// 单实例锁：第二次启动时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// 持久化
const store = new Store({
  name: 'config',
  defaults: {
    position: null,        // { x, y } 屏幕坐标
    zodiac: null,          // 'scorpio' 等
    autoStart: false,
    todayFortune: {},      // { 'yyyy-mm-dd': { style, score, data } }
    behavior: {},          // { styleName: { clicks, view_seconds, last_seen } }
    manualSwitchCount: 0,  // 用户主动"换一换"计数（每 5 次临时降权被切走的风格）
    aiConfig: { baseUrl: '', encryptedToken: null, tokenObfuscated: null, model: '' },
    localModel: '',         // 用户选择的本地模型名（空 = 用线上）
    aiCache: {},           // { 'yyyy-mm-dd': { style: { text, usage, ts } } }
    aiAskCache: {},        // { hash: { text, ts } }
    momentCache: {},       // { 'moment|yyyy-mm-dd|hhKey': { score, data, ts } }
    tomorrowCache: {},     // { 'yyyy-mm-dd': { score, data, ts } }
    weekCache: {},         // { 'yyyy-Www': { score, data, ts } }
  },
});

// 全局状态
let ballWindow = null;
let cardWindow = null;
let tray = null;
let isQuitting = false;
// 球在 transform 坐标里的当前位置（renderer 通过 IPC 更新）
let currentBallPos = { x: 0, y: 0 };
const BALL_HALO = 40;
let lastIgnoreState = null;

const BALL_SIZE = 80;
const CARD_WIDTH = 380;
const CARD_HEIGHT = 600;
const CARD_OFFSET = 12; // 卡片距球的偏移

// 统一 AI 配置入口：线上优先（默认硬编码 DeepSeek；用户主动启用本地才用本地）
async function resolveAiConfig() {
  const localModel = store.get('localModel') || '';
  if (localModel) {
    const ok = await localLLM.checkLocal();
    if (ok) {
      return {
        baseUrl: localLLM.LOCAL_BASE_URL,
        token: localLLM.LOCAL_TOKEN,
        model: localModel,
        source: 'local',
      };
    }
    logger.warn('resolveAiConfig', `local model "${localModel}" configured but Ollama unavailable, fallback to online`);
  }
  return { ...onlineConfig, source: 'online' };
}

// 启动参数：--hidden 用于开机自启时不显示球
const startHidden = process.argv.includes('--hidden');

// 主显示器 bounds（球窗口覆盖整个屏幕）
function getPrimaryBounds() {
  return screen.getPrimaryDisplay().bounds;
}

// 球在 transform 坐标系下的默认位置（屏幕右下角）
function getDefaultPosition() {
  const b = getPrimaryBounds();
  return {
    x: b.width  - BALL_SIZE - 40,
    y: b.height - BALL_SIZE - 40,
  };
}

// 把保存的 transform 位置 clamp 到屏幕内
function clampPosition(pos) {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
    return getDefaultPosition();
  }
  const b = getPrimaryBounds();
  return {
    x: Math.max(0, Math.min(pos.x, b.width  - BALL_SIZE)),
    y: Math.max(0, Math.min(pos.y, b.height - BALL_SIZE)),
  };
}

// ---------- 窗口创建 ----------
function createBallWindow() {
  try {
    _createBallWindowImpl();
  } catch (e) {
    logger.error('main.window', `createBallWindow failed: ${e.message}`);
    throw e;
  }
}
function _createBallWindowImpl() {
  const bounds = getPrimaryBounds();

  ballWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Electron 30+：从 Alt+Tab 列表排除
  if (typeof ballWindow.setExcludedFromAltTab === 'function') {
    ballWindow.setExcludedFromAltTab(true);
  }

  // OS 层点击穿透：默认忽略鼠标事件（forward 让 mousemove 仍能进入 renderer，
  // renderer 据此动态切回 false 让球本身可点）。
  ballWindow.setIgnoreMouseEvents(true, { forward: true });

  ballWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  ballWindow.once('ready-to-show', () => {
    if (!startHidden) ballWindow.show();
  });

  // close-to-tray
  ballWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      ballWindow.hide();
    }
  });
}

// 缓存最近的球的屏幕坐标（用于卡片定位）
let lastBallScreenPos = { x: 0, y: 0 };

// 球的实时屏幕坐标 = 窗口原点 + transform 偏移（不依赖上次抽签位置）
// 返回整数（Electron setPosition / BrowserWindow 要求整数，浮点会 conversion failure）
function getBallScreenPos() {
  const b = ballWindow && !ballWindow.isDestroyed() ? ballWindow.getBounds() : { x: 0, y: 0 };
  return {
    x: Math.round(b.x + (currentBallPos.x || 0)),
    y: Math.round(b.y + (currentBallPos.y || 0)),
  };
}

// 根据球的屏幕坐标计算卡片的目标位置（不直接应用）
function computeCardPosition(ballScreenX, ballScreenY) {
  const work = screen.getPrimaryDisplay().workArea;
  // 卡片位置：球右边偏移；如果超出右边界则放到球左边
  let cardX = ballScreenX + BALL_SIZE + CARD_OFFSET;
  if (cardX + CARD_WIDTH > work.x + work.width) {
    cardX = ballScreenX - CARD_WIDTH - CARD_OFFSET;
  }
  let cardY = ballScreenY;
  if (cardY + CARD_HEIGHT > work.y + work.height) {
    cardY = work.y + work.height - CARD_HEIGHT;
  }
  if (cardY < work.y) cardY = work.y;
  return { x: Math.round(cardX), y: Math.round(cardY) };
}

function createCardWindow(ballScreenX, ballScreenY) {
  try {
    return _createCardWindowImpl(ballScreenX, ballScreenY);
  } catch (e) {
    logger.error('main.window', `createCardWindow failed: ${e.message}`);
    throw e;
  }
}
function _createCardWindowImpl(ballScreenX, ballScreenY) {
  // 更新缓存
  if (typeof ballScreenX === 'number') lastBallScreenPos.x = ballScreenX;
  if (typeof ballScreenY === 'number') lastBallScreenPos.y = ballScreenY;

  if (cardWindow && !cardWindow.isDestroyed()) {
    // 复用时，按最新球坐标重新定位
    const pos = computeCardPosition(lastBallScreenPos.x, lastBallScreenPos.y);
    cardWindow.setPosition(pos.x, pos.y);
    return cardWindow;
  }
  const pos = computeCardPosition(lastBallScreenPos.x, lastBallScreenPos.y);

  cardWindow = new BrowserWindow({
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    parent: ballWindow,
    modal: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (typeof cardWindow.setExcludedFromAltTab === 'function') {
    cardWindow.setExcludedFromAltTab(true);
  }

  cardWindow.loadFile(path.join(__dirname, 'src', 'card.html'));

  cardWindow.once('ready-to-show', () => cardWindow.show());

  cardWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      closeCardWindow();
    }
  });

  cardWindow.on('blur', () => {
    // 失焦自动关闭（除非用户在交互中，由渲染器通过 _stayOpen 标记抑制）
    if (!cardWindow._stayOpen) closeCardWindow();
  });

  // 等 webContents 加载完后再发待发的 card-data
  cardWindow.webContents.once('did-finish-load', () => {
    if (cardWindow._pendingCardData) {
      cardWindow.webContents.send('card-data', cardWindow._pendingCardData);
      cardWindow._pendingCardData = null;
    }
  });

  return cardWindow;
}

// 把待发数据塞到 cardWindow 上，did-finish-load 后再 send
function queueCardData(data) {
  const win = createCardWindow();
  if (win.webContents.isLoading()) {
    win._pendingCardData = data;
    logger.info('main.card', `queue pending style=${data.style}`);
  } else {
    try {
      win.webContents.send('card-data', data);
      logger.info('main.card', `sent style=${data.style}`);
    } catch (e) {
      logger.error('main.card', `send failed: ${e.message}`);
    }
  }
}

// ---------- 设置面板窗口 ----------
let settingsWindow = null;
function createSettingsWindow() {
  try {
    return _createSettingsWindowImpl();
  } catch (e) {
    logger.error('main.window', `createSettingsWindow failed: ${e.message}`);
    throw e;
  }
}
function _createSettingsWindowImpl() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 480,
    minWidth: 400,
    minHeight: 360,
    transparent: false,
    frame: true,
    title: '设置',
    alwaysOnTop: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#1a1d24',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  return settingsWindow;
}

// ---------- AI 输入浮窗 ----------
let aiInputWindow = null;
function createAiInputWindow() {
  try {
    return _createAiInputWindowImpl();
  } catch (e) {
    logger.error('main.window', `createAiInputWindow failed: ${e.message}`);
    throw e;
  }
}
function _createAiInputWindowImpl() {
  if (aiInputWindow && !aiInputWindow.isDestroyed()) {
    return aiInputWindow;
  }
  aiInputWindow = new BrowserWindow({
    width: 380,
    height: 190,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  if (typeof aiInputWindow.setExcludedFromAltTab === 'function') {
    aiInputWindow.setExcludedFromAltTab(true);
  }
  aiInputWindow.setMenuBarVisibility(false);
  aiInputWindow.loadFile(path.join(__dirname, 'src', 'aiInput.html'));
  aiInputWindow.on('blur', () => {
    // 浮窗失焦自动关（用户点别处就收起来）
    if (aiInputWindow && !aiInputWindow.isDestroyed()) aiInputWindow.hide();
  });
  aiInputWindow.on('closed', () => { aiInputWindow = null; });
  return aiInputWindow;
}

// 浮窗定位：贴在球的右上角偏移
function positionAiInputNearBall() {
  if (!aiInputWindow || aiInputWindow.isDestroyed()) return;
  const bounds = ballWindow.getBounds();
  const work = screen.getPrimaryDisplay().workArea;
  const w = 380, h = 190;
  // 默认放在球右上
  let x = bounds.x + currentBallPos.x + BALL_SIZE + 8;
  let y = bounds.y + currentBallPos.y - 20;
  // 右边越界 → 放球左侧
  if (x + w > work.x + work.width) x = bounds.x + currentBallPos.x - w - 8;
  // 左边越界 → clamp
  if (x < work.x) x = work.x + 8;
  // 下边越界 → 上移
  if (y + h > work.y + work.height) y = work.y + work.height - h - 8;
  if (y < work.y) y = work.y + 8;
  aiInputWindow.setPosition(Math.round(x), Math.round(y));
}

// ---------- 托盘 ----------
function createTray() {
  // 占位图标：1x1 透明（用户后续可替换为真实 ICO）
  const iconPath = path.join(__dirname, 'src', 'assets', 'tray.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) throw new Error('empty');
  } catch {
    // 退化：空 image
    icon = nativeImage.createEmpty();
  }

  try {
    tray = new Tray(icon);
  } catch (e) {
    console.error('Tray 创建失败:', e.message);
    logger.error('tray', `init failed: ${e.message}`);
    return;
  }

  tray.setToolTip('今日运势');
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: '显示悬浮球',
      click: () => {
        logger.info('main.tray', 'show ball');
        if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
        ballWindow.show();
        ballWindow.focus();
      },
    },
    {
      label: '隐藏悬浮球',
      click: () => {
        logger.info('main.tray', 'hide all');
        if (ballWindow && !ballWindow.isDestroyed()) ballWindow.hide();
        if (cardWindow && !cardWindow.isDestroyed()) cardWindow.hide();
        if (aiInputWindow && !aiInputWindow.isDestroyed()) aiInputWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: '抽一签',
      click: () => {
        logger.info('main.tray', 'draw fortune');
        if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
        ballWindow.show();
        ballWindow.focus();
        // 通过 webContents 触发球的点击
        ballWindow.webContents.send('shortcut-draw');
      },
    },
    {
      label: 'AI 运势解读...',
      click: () => {
        if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
        ballWindow.show();
        ballWindow.focus();
        const win = createAiInputWindow();
        positionAiInputNearBall();
        win.show();
        win.focus();
        if (win.webContents.isLoading()) {
          win.webContents.once('did-finish-load', () => {
            win.webContents.send('ai-input-focus');
          });
        } else {
          win.webContents.send('ai-input-focus');
        }
      },
    },
    { type: 'separator' },
    {
      label: '设置...',
      click: () => {
        createSettingsWindow();
      },
    },
    { type: 'separator' },
    {
      label: '开机自启',
      type: 'checkbox',
      checked: store.get('autoStart') === true,
      enabled: app.isPackaged, // dev 模式禁用
      click: (item) => {
        store.set('autoStart', item.checked);
        applyAutoStart(item.checked);
      },
    },
    {
      label: '重置位置',
      click: () => {
        logger.info('main.tray', 'reset position');
        store.set('position', null);
        if (ballWindow && !ballWindow.isDestroyed()) {
          const pos = getDefaultPosition();
          ballWindow.setPosition(pos.x, pos.y);
          store.set('position', pos);
        }
      },
    },
    { type: 'separator' },
    {
      label: '日志级别',
      submenu: [
        { label: 'info（全部）', type: 'radio', checked: logger.getLevel() === 'info',
          click: () => { logger.setLevel('info'); rebuildTrayMenu(); } },
        { label: 'warn', type: 'radio', checked: logger.getLevel() === 'warn',
          click: () => { logger.setLevel('warn'); rebuildTrayMenu(); } },
        { label: 'error', type: 'radio', checked: logger.getLevel() === 'error',
          click: () => { logger.setLevel('error'); rebuildTrayMenu(); } },
      ],
    },
    {
      label: '打开日志文件夹',
      click: () => {
        try { shell.openPath(logger.getLogDir()); } catch {}
      },
    },
    {
      label: '清空日志',
      click: () => {
        if (confirm('确定清空所有日志？')) {
          logger.clearAll();
          logger.info('main', 'logs cleared');
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function applyAutoStart(enabled) {
  if (!app.isPackaged) return; // dev 模式不写注册表
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      args: ['--hidden'],
    });
  } catch (e) {
    console.error('setLoginItemSettings 失败:', e.message);
    logger.warn('autoStart', `setLoginItemSettings failed: ${e.message}`);
  }
}

// ---------- IPC ----------
// 包装 ipcMain.handle：自动打入口日志 + 异常兜底
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...rest) => {
    logIpcStart(channel, rest);
    try {
      return await fn(event, ...rest);
    } catch (e) {
      logger.error('ipc', `${channel} threw: ${e.message}`, { stack: String(e.stack || '').slice(0, 800) });
      throw e;
    }
  });
}

function registerIpc() {
  handle('get-config', (_e, key) => {
    if (key) return store.get(key);
    return store.store;
  });

  handle('save-config', (_e, key, value) => {
    if (typeof key !== 'string') return false;
    store.set(key, value);
    return true;
  });

  handle('record-interaction', (_e, style, durationSeconds) => {
    if (typeof style !== 'string') return false;
    const behaviorMap = store.get('behavior') || {};
    const now = Date.now();
    const cur = behaviorMap[style] || { clicks: 0, view_seconds: 0, last_seen: 0 };
    cur.clicks = (cur.clicks || 0) + 1;
    cur.view_seconds = (cur.view_seconds || 0) + Math.max(0, Math.floor(durationSeconds || 0));
    cur.last_seen = now;
    behaviorMap[style] = cur;
    store.set('behavior', behaviorMap);
    return true;
  });

  handle('manual-switch', (_e, fromStyle) => {
    // 每 5 次手动切换，临时降权被切走的风格（标记 last_seen 为 0）
    const count = store.get('manualSwitchCount') || 0;
    const next = count + 1;
    store.set('manualSwitchCount', next);
    if (next >= 5 && typeof fromStyle === 'string') {
      const behaviorMap = store.get('behavior') || {};
      if (behaviorMap[fromStyle]) {
        behaviorMap[fromStyle].last_seen = 0;
        store.set('behavior', behaviorMap);
      }
      store.set('manualSwitchCount', 0);
    }
    return true;
  });

  // 位置保存：球在 transform 坐标里的位置
  handle('save-position', (_e, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    const clamped = clampPosition({ x, y });
    store.set('position', clamped);
    return clamped;
  });

  // renderer 同步球的当前 transform 位置给主进程（用于 ignore-mouse 决策）
  handle('update-ball-pos', (_e, x, y) => {
    if (typeof x === 'number' && typeof y === 'number') {
      // 取整，避免浮点坐标传给 Electron 原生方法（setPosition/BrowserWindow）导致 conversion failure
      currentBallPos = { x: Math.round(x), y: Math.round(y) };
    }
    return true;
  });

  handle('show-card', (_e, style, score, fortuneData, ballX, ballY) => {
    const win = createCardWindow(ballX, ballY);
    win._stayOpen = true;
    queueCardData({ style, score, fortune: fortuneData });
    win.show();
    win.focus();
    setTimeout(() => { win._stayOpen = false; }, 500);
    return true;
  });

  handle('close-card', () => {
    closeCardWindow();
    return true;
  });

  // 动画用：返回主显示器 workArea（去掉任务栏的可见区域，让弹跳中心和视觉中心对齐）
  handle('get-screen-info', () => {
    const w = screen.getPrimaryDisplay().workArea;
    return { width: w.width, height: w.height, x: w.x, y: w.y };
  });

  // OS 层鼠标穿透切换：renderer 根据光标位置动态调用
  handle('set-ignore-mouse', (_e, ignore) => {
    if (!ballWindow || ballWindow.isDestroyed()) return false;
    ballWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
    return true;
  });

  // ---------- 运势 ----------
  handle('draw-fortune', (_e, options = {}) => {
    const { deferCard = false, scope = 'today' } = options;
    const todayKey = fortune.getTodayKey();
    const cached = store.get('todayFortune') || {};
    const showCard = (style, score, data) => {
      if (deferCard) return;
      const win = createCardWindow(lastBallScreenPos.x, lastBallScreenPos.y);
      win._stayOpen = true;
      cardCurrentStyle = style;
      queueCardData({ style, score, fortune: data });
      win.show();
      win.focus();
      setTimeout(() => { if (win && !win.isDestroyed()) win._stayOpen = false; }, 500);
      // 异步追加 AI 解读（不阻塞主流程）
      tryAppendAiInterpretation(style, score, data, todayKey);
    };

    // ===== scope=moment: 此刻（按时辰缓存 2 小时）=====
    if (scope === 'moment') {
      logger.info('main.drawFortune', `scope=moment`);
      const hourKey = fortune.getCurrentHourKey();
      const cacheKey = `moment|${todayKey}|${hourKey}`;
      const momentCache = store.get('momentCache') || {};
      if (momentCache[cacheKey]) {
        const entry = momentCache[cacheKey];
        logger.info('main.drawFortune', `scope=moment cached hour=${hourKey}`);
        showCard('moment', entry.score, entry.data);
        return { style: 'moment', score: entry.score, fortune: entry.data, cached: true };
      }
      const data = fortune.genHourFortune({ dateKey: todayKey, hourKey });
      momentCache[cacheKey] = { score: data.score, data, ts: Date.now() };
      // 清理 7 天前的
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(momentCache)) {
        if (momentCache[k].ts < cutoff) delete momentCache[k];
      }
      store.set('momentCache', momentCache);
      showCard('moment', data.score, data);
      return { style: 'moment', score: data.score, fortune: data, cached: false };
    }

    // ===== scope=tomorrow: 明日（按明日 dateKey 缓存）=====
    if (scope === 'tomorrow') {
      const tomorrow = new Date(Date.now() + 86400000);
      const tomorrowKey = fortune.getTodayKey(tomorrow);
      const tomorrowCache = store.get('tomorrowCache') || {};
      logger.info('main.drawFortune', `scope=tomorrow dateKey=${tomorrowKey}`);
      if (tomorrowCache[tomorrowKey]) {
        const entry = tomorrowCache[tomorrowKey];
        logger.info('main.drawFortune', `scope=tomorrow cached`);
        showCard('tomorrow', entry.score, entry.data);
        return { style: 'tomorrow', score: entry.score, fortune: entry.data, cached: true };
      }
      const data = fortune.genTomorrowFortune({ dateKey: tomorrowKey });
      tomorrowCache[tomorrowKey] = { score: data.score, data, ts: Date.now() };
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(tomorrowCache)) {
        if (tomorrowCache[k].ts < cutoff) delete tomorrowCache[k];
      }
      store.set('tomorrowCache', tomorrowCache);
      showCard('tomorrow', data.score, data);
      return { style: 'tomorrow', score: data.score, fortune: data, cached: false };
    }

    // ===== scope=week: 本周（按 ISO 周缓存）=====
    if (scope === 'week') {
      const isoWeek = fortune.getIsoWeek(new Date());
      const weekCache = store.get('weekCache') || {};
      logger.info('main.drawFortune', `scope=week iso=${isoWeek}`);
      if (weekCache[isoWeek]) {
        const entry = weekCache[isoWeek];
        logger.info('main.drawFortune', `scope=week cached`);
        showCard('week', entry.score, entry.data);
        return { style: 'week', score: entry.score, fortune: entry.data, cached: true };
      }
      const data = fortune.genWeekFortune({ dateKey: todayKey });
      weekCache[isoWeek] = { score: data.score, data, ts: Date.now() };
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(weekCache)) {
        if (weekCache[k].ts < cutoff) delete weekCache[k];
      }
      store.set('weekCache', weekCache);
      showCard('week', data.score, data);
      return { style: 'week', score: data.score, fortune: data, cached: false };
    }

    // ===== scope=today（默认）: 沿用第一/二阶段逻辑 =====
    // 当日已有缓存 → 直接返回 + 记录行为
    if (cached[todayKey]) {
      const entry = cached[todayKey];
      const behaviorMap = store.get('behavior') || {};
      behavior.recordInteraction(behaviorMap, entry.style, 0);
      store.set('behavior', behaviorMap);
      logger.info('main.drawFortune', `scope=today cached style=${entry.style}`);
      showCard(entry.style, entry.score, entry.data);
      return { style: entry.style, score: entry.score, fortune: entry.data, cached: true };
    }
    // 选风格
    const behaviorMap = store.get('behavior') || {};
    const style = behavior.pickStyle(behaviorMap);
    logger.info('main.drawFortune', `scope=today picked style=${style}`);
    // 累计交互次数（用于 personalized 退化）
    const totalClicks = behavior.STYLES.reduce(
      (sum, s) => sum + ((behaviorMap[s] && behaviorMap[s].clicks) || 0), 0
    );
    // 取 top 2 风格用于 personalized
    const ranked = behavior.STYLES.map(s => ({
      s,
      v: ((behaviorMap[s] && behaviorMap[s].clicks) || 0) * 1 +
         ((behaviorMap[s] && behaviorMap[s].view_seconds) || 0) * 0.01,
    })).sort((a, b) => b.v - a.v).slice(0, 2).map(x => x.s);
    // 生成
    const data = fortune.generate(style, {
      dateKey: todayKey,
      zodiac: store.get('zodiac'),
      totalClicks,
      topStyles: ranked,
    });
    // 缓存
    cached[todayKey] = { style, score: data.score, data };
    // 只保留最近 7 天的缓存，避免 store 膨胀
    const dates = Object.keys(cached).sort();
    if (dates.length > 7) {
      for (const d of dates.slice(0, dates.length - 7)) delete cached[d];
    }
    store.set('todayFortune', cached);
    // 记录行为（仅 today scope）
    behavior.recordInteraction(behaviorMap, style, 0);
    store.set('behavior', behaviorMap);
    showCard(style, data.score, data);
    return { style, score: data.score, fortune: data, cached: false };
  });

  // 单独控制卡片显示（用于动画结束后）
  handle('show-fortune-card', (_e, style, score, fortuneData, ballX, ballY) => {
    if (typeof style !== 'string') return false;
    const win = createCardWindow(ballX, ballY);
    win._stayOpen = true;
    cardCurrentStyle = style;
    queueCardData({ style, score, fortune: fortuneData });
    win.show();
    win.focus();
    setTimeout(() => { if (win && !win.isDestroyed()) win._stayOpen = false; }, 500);
    return true;
  });

  handle('get-today-fortune', () => {
    const todayKey = fortune.getTodayKey();
    const cached = store.get('todayFortune') || {};
    const entry = cached[todayKey];
    if (!entry) return null;
    return { style: entry.style, score: entry.score, fortune: entry.data };
  });

  // card-opened：仅记录打开时间（关闭由 closeCardWindow 统一处理）
  handle('card-opened', () => {
    cardOpenedAt = Date.now();
    return true;
  });
  // card-closed：保留以兼容 card.js 的旧调用，但实际逻辑统一走 closeCardWindow
  handle('card-closed', (_e, style) => {
    if (typeof style === 'string') cardCurrentStyle = style;
    closeCardWindow();
    return true;
  });

  // ---------- 模型管理（线上硬编码 + 本地可切换/下载）----------

  // 返回当前生效的模型来源（只读状态，供设置面板展示）
  handle('get-llm-status', async () => {
    const cfg = await resolveAiConfig();
    return { source: cfg.source, model: cfg.model, baseUrl: cfg.baseUrl };
  });

  // 列出 Ollama 已装模型
  handle('get-local-models', async () => {
    return await localLLM.listModels();
  });

  // 设置本地模型名（空 = 清除，回到线上）
  handle('set-local-model', (_e, name) => {
    const v = typeof name === 'string' ? name.trim() : '';
    store.set('localModel', v);
    logger.info('localModel', `set to "${v}"`);
    return true;
  });

  // 下载本地模型（Ollama pull）
  handle('pull-local-model', async (_e, name) => {
    const result = await localLLM.pullModel(name);
    logger.info('localModel', `pull "${name}" ok=${result.ok}`);
    return result;
  });

  handle('open-settings', () => {
    createSettingsWindow();
    return true;
  });

  // ---------- AI 浮窗 ----------
  handle('open-ai-input', () => {
    const win = createAiInputWindow();
    positionAiInputNearBall();
    win.show();
    win.focus();
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('ai-input-focus');
      });
    } else {
      win.webContents.send('ai-input-focus');
    }
    return true;
  });

  handle('close-ai-input', () => {
    if (aiInputWindow && !aiInputWindow.isDestroyed()) aiInputWindow.hide();
    return true;
  });

  // 用户在浮窗提交提问 → 调模型 → 弹卡片显示
  handle('ai-interpret-ask', async (_e, payload = {}) => {
    const query = (payload.query || '').trim();
    if (!query) return { ok: false, error: 'EMPTY_QUERY' };

    const aiCfg = await resolveAiConfig();
    if (!aiCfg.token) {
      if (aiInputWindow && !aiInputWindow.isDestroyed()) {
        aiInputWindow.webContents.send('ai-input-error', {
          kind: 'NO_TOKEN',
          text: '请先在设置中配置 API Token',
        });
        setTimeout(() => createSettingsWindow(), 600);
      }
      return { ok: false, error: 'NO_TOKEN' };
    }

    // 24h 内同问题缓存
    const hash = simpleHash(query);
    const askCache = store.get('aiAskCache') || {};
    const cached = askCache[hash];
    if (cached && (Date.now() - cached.ts) < 24 * 3600 * 1000) {
      showAiCardOnly(query, cached.text);
      if (aiInputWindow && !aiInputWindow.isDestroyed()) aiInputWindow.hide();
      return { ok: true, cached: true };
    }

    if (aiInputWindow && !aiInputWindow.isDestroyed()) {
      aiInputWindow.webContents.send('ai-input-loading', true);
    }

    try {
      const result = await ai.interpretAsk({
        userQuery: query,
        ctx: {
          dateKey: fortune.getTodayKey(),
          zodiac: store.get('zodiac'),
        },
        aiConfig: aiCfg,
      });
      askCache[hash] = { text: result.text, ts: Date.now() };
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(askCache)) {
        if (askCache[k].ts < cutoff) delete askCache[k];
      }
      store.set('aiAskCache', askCache);
      showAiCardOnly(query, result.text);
      if (aiInputWindow && !aiInputWindow.isDestroyed()) aiInputWindow.hide();
      console.log(`[AI] ask interpreted, tokens=${result.usage.total_tokens || '?'}`);
      logger.info('ai.interpretAsk', `tokens=${result.usage.total_tokens || '?'}`);
      return { ok: true };
    } catch (e) {
      const msg = String(e.message || e);
      console.error('[AI] interpretAsk failed:', msg);
      logger.error('ai.interpretAsk', msg, { query: query.slice(0, 50) });
      if (aiInputWindow && !aiInputWindow.isDestroyed()) {
        aiInputWindow.webContents.send('ai-input-loading', false);
        aiInputWindow.webContents.send('ai-input-error', {
          kind: msg,
          text: friendlyError(msg),
        });
      }
      return { ok: false, error: msg };
    }
  });
}

// hash 字符串（FNV-1a 32 位，够用）
function simpleHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return 'h_' + h.toString(36);
}

// IPC 入口日志 helper：自动捕获 ipc channel 名 + 简单参数摘要
function logIpcStart(channel, args) {
  try {
    const summary = args.map((a) => {
      if (a == null) return String(a);
      if (typeof a === 'string') return a.length > 40 ? a.slice(0, 40) + '...' : a;
      if (typeof a === 'number') return String(a);
      if (typeof a === 'boolean') return String(a);
      if (Array.isArray(a)) return `[${a.length}]`;
      return '{...}';
    });
    logger.info('ipc', `${channel} args=${summary.join(',')}`);
  } catch {}
}

function friendlyError(code) {
  return {
    NO_TOKEN: '尚未配置 Token，请先在设置中填入',
    AUTH_FAILED: 'Token 无效或已过期，请检查',
    RATE_LIMITED: '调用太频繁，请稍后再试',
    TIMEOUT: '网络有点慢，稍后再试',
    NETWORK: '网络好像不太给力',
    EMPTY_QUERY: '问题不能为空',
    EMPTY_RESPONSE: '模型没有返回内容',
  }[code] || ('请求失败：' + code);
}

// 弹出只含 AI 解读的卡片（无 5 种内置主体）
function showAiCardOnly(userQuery, aiText) {
  const pos = getBallScreenPos();
  const win = createCardWindow(pos.x, pos.y);
  win._stayOpen = true;
  cardCurrentStyle = 'ai-ask';
  const fakeFortune = {
    title: 'AI 解读',
    query: userQuery,
    text: aiText,
  };
  queueCardData({ style: 'ai-ask', score: 0, fortune: fakeFortune });
  win.show();
  win.focus();
  setTimeout(() => { if (win && !win.isDestroyed()) win._stayOpen = false; }, 500);
}

// ---------- 当次抽签后异步追加 AI 解读到卡片 ----------
async function tryAppendAiInterpretation(style, score, fortuneData, dateKey) {
  const aiCfg = await resolveAiConfig();
  if (!aiCfg.token) return; // 没 token 直接静默退出

  // 缓存命中（同一天同风格）→ 直接发
  const aiCache = store.get('aiCache') || {};
  const cached = aiCache[dateKey] && aiCache[dateKey][style];
  if (cached && cached.text) {
    if (cardWindow && !cardWindow.isDestroyed()) {
      cardWindow.webContents.send('ai-interpretation-ready', {
        text: cached.text,
        usage: cached.usage,
      });
    }
    return;
  }

  try {
    const result = await ai.interpretFortune({
      style,
      fortuneData,
      ctx: {
        dateKey,
        zodiac: store.get('zodiac'),
      },
      aiConfig: aiCfg,
    });
    // 写缓存
    if (!aiCache[dateKey]) aiCache[dateKey] = {};
    aiCache[dateKey][style] = {
      text: result.text,
      usage: result.usage,
      ts: Date.now(),
    };
    // 清理 7 天前
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    for (const d of Object.keys(aiCache)) {
      const dayEntries = aiCache[d];
      let allOld = true;
      for (const s of Object.keys(dayEntries)) {
        if (dayEntries[s].ts < cutoff) delete dayEntries[s];
        else allOld = false;
      }
      if (allOld || Object.keys(dayEntries).length === 0) delete aiCache[d];
    }
    store.set('aiCache', aiCache);
    // 推送给当前打开的卡片
    if (cardWindow && !cardWindow.isDestroyed()) {
      cardWindow.webContents.send('ai-interpretation-ready', {
        text: result.text,
        usage: result.usage,
      });
    }
    console.log(`[AI] ${style} interpreted, tokens=${result.usage.total_tokens || '?'}`);
    logger.info('ai.interpretFortune', `${style} tokens=${result.usage.total_tokens || '?'}`);
  } catch (e) {
    console.warn(`[AI] skip interpretation for ${style}:`, e.message);
    logger.warn('ai.interpretFortune', `skip ${style}: ${e.message}`);
    // 失败静默降级：卡片不显示 AI 区
  }
}

// 模块级变量：卡片状态
let cardOpenedAt = 0;
let cardCurrentStyle = null;

// 统一的卡片关闭入口：所有 hide() 路径（X 按钮、blur、close-card IPC）都走这里
// 负责记录 view_seconds 统计 + 通知球归位
function closeCardWindow() {
  if (!cardWindow || cardWindow.isDestroyed()) {
    logger.info('main.card', 'close skipped (no card)');
    return;
  }
  // 统计 view_seconds
  let durationS = 0;
  if (cardOpenedAt > 0 && cardCurrentStyle) {
    durationS = Math.floor((Date.now() - cardOpenedAt) / 1000);
    const behaviorMap = store.get('behavior') || {};
    const cur = behaviorMap[cardCurrentStyle] || { clicks: 0, view_seconds: 0, last_seen: 0 };
    cur.view_seconds = (cur.view_seconds || 0) + durationS;
    cur.last_seen = Date.now();
    behaviorMap[cardCurrentStyle] = cur;
    store.set('behavior', behaviorMap);
    cardOpenedAt = 0;
  }
  logger.info('main.card', `close style=${cardCurrentStyle} dur=${durationS}s`);
  cardWindow.hide();
  // 通知球窗口归位
  if (ballWindow && !ballWindow.isDestroyed()) {
    ballWindow.webContents.send('reset-ball');
  }
}

// ---------- 全局快捷键 ----------
function registerShortcut() {
  try {
    globalShortcut.register('CommandOrControl+Alt+F', () => {
      if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
      ballWindow.show();
      ballWindow.focus();
      // 触发抽签：通过 webContents 发个事件给渲染端
      ballWindow.webContents.send('shortcut-draw');
    });
  } catch (e) {
    console.error('globalShortcut 注册失败:', e.message);
    logger.warn('shortcut', `register failed: ${e.message}`);
  }
}

// ---------- 生命周期 ----------
app.on('second-instance', () => {
  logger.info('main.lifecycle', 'second-instance launched');
  if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
  if (ballWindow.isMinimized()) ballWindow.restore();
  ballWindow.show();
  ballWindow.focus();
});

app.whenReady().then(() => {
  logger.info('main', 'app ready', {
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
  });
  registerIpc();
  registerLogIpc();
  createBallWindow();
  createTray();
  registerShortcut();
  applyAutoStart(store.get('autoStart') === true);
  startCursorPolling();
  startWatcher();

  // 启动 5 秒后跑一次自检（给窗口/托盘/快捷键留出初始化时间）
  setTimeout(() => {
    selfCheck.runSelfCheck({
      logWatcher,
      onlineConfig,
      localLLM,
      tray,
      ballWindow,
      globalShortcut,
    }).catch((e) => logger.warn('selfCheck', `run failed: ${e.message}`));
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBallWindow();
  });
});

// 全部窗口关闭时不退出（托盘应用）
app.on('window-all-closed', (e) => {
  logger.info('main.lifecycle', 'window-all-closed');
  if (!isQuitting && process.platform !== 'darwin') {
    // 阻止默认的 quit 行为
  }
});

app.on('before-quit', () => {
  logger.info('main.lifecycle', 'before-quit');
  isQuitting = true;
  // 落盘最终位置
  if (ballWindow && !ballWindow.isDestroyed()) {
    const [x, y] = ballWindow.getPosition();
    store.set('position', clampPosition({ x, y }));
  }
});

app.on('will-quit', () => {
  logger.info('main.lifecycle', 'will-quit');
  try { globalShortcut.unregisterAll(); } catch {}
  if (cursorPollTimer) clearInterval(cursorPollTimer);
});

// ---------- 主进程轮询光标位置，独立决策 ignore-mouse ----------
// 不依赖 renderer 的 mousemove 事件（避免 forwarded 事件丢/延迟问题）
let cursorPollTimer = null;
function startCursorPolling() {
  if (cursorPollTimer) return;
  logger.info('main.cursorPolling', 'started');
  cursorPollTimer = setInterval(() => {
    if (!ballWindow || ballWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = ballWindow.getBounds();
    // 球屏幕坐标 = 窗口原点 + transform 坐标
    const ballLeft   = bounds.x + currentBallPos.x - BALL_HALO;
    const ballRight  = bounds.x + currentBallPos.x + BALL_SIZE + BALL_HALO;
    const ballTop    = bounds.y + currentBallPos.y - BALL_HALO;
    const ballBottom = bounds.y + currentBallPos.y + BALL_SIZE + BALL_HALO;
    const isOver = cursor.x >= ballLeft && cursor.x <= ballRight &&
                   cursor.y >= ballTop  && cursor.y <= ballBottom;
    const shouldIgnore = !isOver;
    if (lastIgnoreState !== shouldIgnore) {
      lastIgnoreState = shouldIgnore;
      // 不带 forward：cursor 不在球上时事件完全穿透，命中球的瞬间再收回
      ballWindow.setIgnoreMouseEvents(shouldIgnore);
    }
  }, 80);
}

// 禁用硬件加速可避免部分 Windows GPU 上的透明窗口闪烁（可选）
// app.commandLine.appendSwitch('disable-gpu-compositing');

// ---------- 渲染端日志 IPC ----------
function registerLogIpc() {
  ipcMain.on('log-info',  (_e, scope, msg, meta) => logger.info(scope, msg, meta || {}));
  ipcMain.on('log-warn',  (_e, scope, msg, meta) => logger.warn(scope, msg, meta || {}));
  ipcMain.on('log-error', (_e, scope, msg, meta) => logger.error(scope, msg, meta || {}));
  ipcMain.on('log-critical', (_e, scope, msg, meta) => logger.critical(scope, msg, meta || {}));
}

// ---------- LogWatcher + AI 诊断 ----------
let logWatcher = null;
async function runAiDiagnose(ctx) {
  const aiCfg = await resolveAiConfig();
  if (!aiCfg.token) {
    logger.warn('watcher.diagnose', 'NO_TOKEN, skip AI', { category: ctx.category });
    return null;
  }
  try {
    const result = await ai.diagnose({
      line: ctx.line,
      recentLines: ctx.recentLines,
      meta: ctx.meta,
      ctx: { level: ctx.level, pattern: ctx.pattern, hint: ctx.hint },
      aiConfig: aiCfg,
    });
    logger.info('watcher.diagnose',
      `${result.rootCause} | 建议: ${result.fix}`,
      { confidence: result.confidence, model: result.model, category: ctx.category },
    );
    return result;
  } catch (e) {
    const msg = String(e.message || e);
    logger.warn('watcher.diagnose', `失败: ${msg}`, { category: ctx.category });
    return null;
  }
}

function notifyCritical(diagnosis, ctx) {
  if (!Notification.isSupported()) return;
  const body = diagnosis
    ? `${diagnosis.rootCause}\n建议: ${diagnosis.fix}`
    : `${ctx.hint || ctx.pattern || '检测到异常'}\n请查看日志了解详情`;
  try {
    const n = new Notification({
      title: '今日运势 · 检测到异常',
      body: body.slice(0, 240),
      urgency: 'critical',
    });
    n.on('click', () => {
      try { shell.openPath(logger.getLogDir()); } catch {}
    });
    n.show();
  } catch (e) {
    logger.warn('notify', 'show failed', { error: e.message });
  }
}

function startWatcher() {
  if (logWatcher) return;
  logWatcher = new LogWatcher();
  logWatcher.start({
    onDiagnose: async (ctx) => {
      const result = await runAiDiagnose(ctx);
      // 把诊断结果挂到 ctx，供 onNotify 用
      ctx._diagnosis = result;
    },
    onNotify: (ctx) => {
      // 等 100ms 让 onDiagnose 先跑（Promise 微任务）
      setTimeout(() => notifyCritical(ctx._diagnosis, ctx), 100);
    },
  });
}
