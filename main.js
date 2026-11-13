// main.js - 主进程
// 桌面悬浮球 - 今日运势
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, globalShortcut, nativeImage, Notification, shell, dialog } = require('electron');
const crypto = require('crypto');
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
const spirit = require('./src/js/fortuneSpirit');
const agent = require('./src/js/agent');
const streak = require('./src/js/streak');

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
    aiConfig: { baseUrl: '', token: '', model: '' },
    localModel: '',         // 用户选择的本地模型名（空 = 用线上）
    profile: { birthday: null, gender: '' },  // 个人测算基础信息
    profileMode: 'comprehensive',              // comprehensive | bazi | zodiac
    profileCache: {},                          // { 'profile|birthday|mode|YYYY-MM-DD': { score, data, ts } }
    fortuneSpirit: null,                       // 运势精灵（null = 首次用 defaultSpirit）
    aiCache: {},           // { 'yyyy-mm-dd': { style: { byKey: { score: { text, usage, ts } } } } }
    aiAskCache: {},        // { hash: { text, ts } }
    momentCache: {},       // { 'moment|yyyy-mm-dd|hhKey': { score, data, ts } }
    tomorrowCache: {},     // { 'yyyy-mm-dd': { score, data, ts } }
    weekCache: {},         // { 'yyyy-Www': { score, data, ts } }
    agentChat: { messages: [], scene: '', updatedAt: 0 },
    animations: true,      // 点击球时是否播放全屏抽签动画
    installId: '',         // 首次启动生成，本机运势种子；重装会变
    dailyReminder: { enabled: false, time: '09:00', lastNotifiedDate: '' }, // 每日一签提醒
    persona: 'cat',        // 桌面形象：cat | dog | caishen | lots
    streak: { count: 0, best: 0, lastDate: '' }, // 连续看运天数
    consentVersion: 0,     // 已同意的协议版本；与 AGREEMENT_VERSION 不一致时首次启动需重新同意
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
// 菜单打开时渲染端上报的「猫 + 面板」外接矩形（屏幕坐标，null = 只用猫身热区）
let ballHitRegion = null;


const BALL_SIZE = 80;
const CARD_WIDTH = 380;
const CARD_HEIGHT = 600;
const CARD_OFFSET = 12; // 卡片距球的偏移
const AI_INPUT_WIDTH = 380;
const AI_INPUT_HEIGHT = 480;
let agentHistory = [];
let agentScene = '';

function loadAgentChat() {
  const c = store.get('agentChat') || agent.emptyAgentChat();
  agentHistory = agent.trimByUserTurns(c.messages || []);
  agentScene = c.scene || '';
}

function saveAgentChat() {
  store.set('agentChat', {
    messages: agent.trimByUserTurns(agentHistory),
    scene: agentScene || '',
    updatedAt: Date.now(),
  });
}

function clearAgentChat() {
  agentHistory = [];
  agentScene = '';
  store.set('agentChat', agent.emptyAgentChat());
}

loadAgentChat();

// 旧版把 API Key 写在 aiConfig.encryptedToken（实际是 base64，非真加密）。
// 新版统一用明文 aiConfig.token；首次启动时迁移一次，避免用户已保存的 Key 丢失。
function migrateLegacyAiConfig() {
  const cfg = store.get('aiConfig');
  if (!cfg || typeof cfg !== 'object') return;
  const hasToken = typeof cfg.token === 'string' && cfg.token.trim();
  const legacy = cfg.encryptedToken;
  if (!hasToken && typeof legacy === 'string' && legacy) {
    try {
      const token = Buffer.from(legacy, 'base64').toString('utf8').trim();
      // OpenAI 兼容服务的 Key 都形如 sk-...；不是这个格式就不猜，等用户重新填写
      if (/^sk-[A-Za-z0-9_\-]+$/.test(token)) {
        store.set('aiConfig', { ...cfg, token, encryptedToken: undefined, tokenObfuscated: undefined });
        logger.info('aiConfig', 'migrated legacy encryptedToken → token');
      } else {
        logger.warn('aiConfig', 'legacy encryptedToken present but format unrecognized, skipped');
      }
    } catch (e) {
      logger.warn('aiConfig', `legacy token migration failed: ${e.message}`);
    }
  } else if (cfg.encryptedToken !== undefined || cfg.tokenObfuscated !== undefined) {
    // 已经有新字段了，顺手清掉旧字段
    store.set('aiConfig', { ...cfg, encryptedToken: undefined, tokenObfuscated: undefined });
  }
}
migrateLegacyAiConfig();

function ensureInstallId() {
  const cur = store.get('installId');
  if (typeof cur === 'string' && cur.length >= 8) return cur;
  const id = crypto.randomUUID();
  store.set('installId', id);
  logger.info('installId', 'generated');
  return id;
}
ensureInstallId();

// 统一的 AI 配置入口：有可用 Ollama 则本地；否则设置面板里的线上配置 / `.env`
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
  // 开发态（npm start）本机 .env 优先，避免旧 Key 盖住新配置；发布版设置面板优先
  return { ...onlineConfig.resolve(store.get('aiConfig'), { preferEnv: !app.isPackaged }), source: 'online' };
}

// 发布版可能内置了 Key；用户自己的 Key 失效时自动回退，并明确告知
let aiFallbackNotice = '';

function builtinAiConfig() {
  const bundled = typeof onlineConfig.loadBundled === 'function' ? onlineConfig.loadBundled() : null;
  if (bundled && bundled.token) {
    return { baseUrl: bundled.baseUrl, token: bundled.token, model: bundled.model, source: 'bundled' };
  }
  if (onlineConfig.token) {
    return { baseUrl: onlineConfig.baseUrl, token: onlineConfig.token, model: onlineConfig.model, source: 'env' };
  }
  return null;
}

function isUserKeyActive() {
  const saved = store.get('aiConfig') || {};
  const merged = onlineConfig.resolve(saved, { preferEnv: !app.isPackaged });
  return merged.tokenSource === 'user' && !!(saved.token || '').trim();
}

// 调用 AI：若使用用户的 Key 且鉴权失败，回退到内置 Key 重试一次
async function withAiFallback(invoke) {
  const cfg = await resolveAiConfig();
  aiFallbackNotice = '';
  try {
    return { cfg, result: await invoke(cfg), usedFallback: false };
  } catch (e) {
    const msg = String((e && e.message) || e);
    const authFailed = /AUTH_FAILED|HTTP_40[13]/.test(msg);
    if (!authFailed || cfg.source !== 'online' || !isUserKeyActive()) throw e;
    const builtin = builtinAiConfig();
    if (!builtin) throw e;
    logger.warn('ai.fallback', 'user key auth failed, retry with builtin key');
    aiFallbackNotice = '你的 API Key 已失效，本次已临时使用应用内置 Key；请到设置更新。';
    const result = await invoke({ ...builtin, source: 'online' });
    return { cfg: builtin, result, usedFallback: true };
  }
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

  // 形象变化后同步给渲染端（renderer 加载完成时也会主动 getPersona）
  ballWindow.webContents.once('did-finish-load', () => {
    broadcastPersona(store.get('persona') || 'cat');
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
// 最近的渲染端 transform 位置；update-ball-pos 是 60fps 通道，不刷日志，顺带节流落盘
let lastPersistedPos = null;
let positionSaveTimer = null;

function persistBallPosition(x, y) {
  const clamped = clampPosition({ x, y });
  lastPersistedPos = clamped;
  if (positionSaveTimer) return; // 已有待写入任务，只需更新 lastPersistedPos
  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null;
    if (lastPersistedPos) store.set('position', lastPersistedPos);
  }, 400);
}

// 球的实时屏幕坐标 = 窗口原点 + transform 偏移（不依赖上次抽签位置）
// 返回整数（Electron setPosition / BrowserWindow 要求整数，浮点会 conversion failure）
function getBallScreenPos() {
  const b = ballWindow && !ballWindow.isDestroyed() ? ballWindow.getBounds() : { x: 0, y: 0 };
  return {
    x: Math.round(b.x + (currentBallPos.x || 0)),
    y: Math.round(b.y + (currentBallPos.y || 0)),
  };
}

// ---------- 运势精灵 ----------
// 记录一次「看今日运势」：每天第一次时连续天数 +1，并通知渲染端
function recordStreak() {
  const todayKey = fortune.getTodayKey();
  const result = streak.checkIn(store.get('streak'), todayKey);
  if (!result.changed) return result;
  store.set('streak', result.state);
  logger.info('streak', `count=${result.streak} best=${result.state.best}`);
  if (ballWindow && !ballWindow.isDestroyed()) {
    try { ballWindow.webContents.send('streak-updated', { streak: result.streak, broke: result.broke }); } catch {}
  }
  rebuildTrayMenu();
  return result;
}

function getSpirit() {
  const s = store.get('fortuneSpirit') || spirit.defaultSpirit();
  // 每周衰减（跨周 -1），并记录当前周
  const weekKey = fortune.getIsoWeek(new Date());
  let next = s;
  try { next = spirit.applyWeeklyDecay(s, weekKey); } catch {}
  // 注意：衰减只在读时改写一次；applyWeeklyDecay 用 boostWeekKey 去重
  if (next !== s) store.set('fortuneSpirit', next);
  return next;
}
function saveSpirit(s) {
  store.set('fortuneSpirit', s);
  return s;
}

// 计算当前球位置对应的五行方位（复用五方分区逻辑，本地实现）
function getCurrentPosWuxing() {
  const pos = getBallScreenPos();
  const work = screen.getPrimaryDisplay().workArea;
  const cx = (work.x || 0) + (work.width || 0) / 2;
  const cy = (work.y || 0) + (work.height || 0) / 2;
  // 中央区域（屏幕中心 30% 宽高以内）→ 土（健康位）
  const nearCenter = Math.abs(pos.x + BALL_SIZE / 2 - cx) < work.width * 0.15 &&
                     Math.abs(pos.y + BALL_SIZE / 2 - cy) < work.height * 0.15;
  if (nearCenter) return 'earth';
  const left = pos.x < cx, top = pos.y < cy;
  if (left && top) return 'water';
  if (!left && top) return 'wood';
  if (left && !top) return 'metal';
  return 'fire';
}

// 摆位定时器：每 60 秒检查球方位，停留满 5 分钟自动积累对应维度
let spiritTimer = null;
function startSpiritAccum() {
  if (spiritTimer) return;
  spiritTimer = setInterval(() => {
    try {
      if (!ballWindow || ballWindow.isDestroyed()) return;
      const wuxing = getCurrentPosWuxing();
      const s = getSpirit();
      const before = s.boosts[wuxing ? spirit.WUXING_TO_DIM[wuxing] : ''] || 0;
      const updated = spirit.applyPosition(s, wuxing, Date.now());
      const dim = spirit.WUXING_TO_DIM[wuxing];
      const after = dim ? (updated.boosts[dim] || 0) : 0;
      if (after > before) {
        logger.info('spirit.accum', `摆位积累：${dim} +1（${wuxing}方位）`, { dim, wuxing });
        // 通知渲染端：猫身边气泡提示（让加持可见）
        if (ballWindow && !ballWindow.isDestroyed()) {
          try {
            ballWindow.webContents.send('spirit-boosted', {
              dim,
              wuxing,
              amount: after - before,
            });
          } catch {}
        }
      }
      saveSpirit(updated);
    } catch (e) {
      logger.warn('spirit.accum', `failed: ${e.message}`);
    }
  }, 60000);
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
    // 失焦自动关闭（除非用户在交互中，或 AI 解读仍在写入）
    if (!cardWindow._stayOpen && !cardWindow._aiPending) closeCardWindow();
  });

  // 等 webContents 加载完后再发待发的 card-data（AI 解读同理，否则首次打开会丢）
  cardWindow.webContents.once('did-finish-load', () => {
    if (cardWindow._pendingCardData) {
      cardWindow.webContents.send('card-data', cardWindow._pendingCardData);
      cardWindow._pendingCardData = null;
    }
    if (cardWindow._pendingAi) {
      cardWindow.webContents.send('ai-interpretation-ready', cardWindow._pendingAi);
      cardWindow._pendingAi = null;
    }
    if (cardWindow._pendingAiStatus) {
      cardWindow.webContents.send('ai-status', cardWindow._pendingAiStatus);
      cardWindow._pendingAiStatus = null;
    }
  });

  return cardWindow;
}

// 把待发数据塞到 cardWindow 上，did-finish-load 后再 send
function queueCardData(data) {
  const win = createCardWindow();
  // 新一次抽签：作废上一张卡片还挂着的解读
  win._pendingAi = null;
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
    height: 680,
    minWidth: 400,
    minHeight: 480,
    transparent: false,
    frame: true,
    title: '设置',
    alwaysOnTop: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#141019', // 与 tokens.css 的 --bg-0 保持一致
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
    width: AI_INPUT_WIDTH,
    height: AI_INPUT_HEIGHT,
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
  const pos = getBallScreenPos();
  const work = screen.getPrimaryDisplay().workArea;
  const w = AI_INPUT_WIDTH, h = AI_INPUT_HEIGHT;
  // 默认放在球右上
  let x = pos.x + BALL_SIZE + 8;
  let y = pos.y - 20;
  // 右边越界 → 放球左侧
  if (x + w > work.x + work.width) x = pos.x - w - 8;
  // 左边越界 → clamp
  if (x < work.x) x = work.x + 8;
  // 下边越界 → 上移
  if (y + h > work.y + work.height) y = work.y + work.height - h - 8;
  if (y < work.y) y = work.y + 8;
  aiInputWindow.setPosition(Math.round(x), Math.round(y));
}

// 打开 AI 对话浮窗（托盘 / 右键 / 设置面板共用这一条路径）
function openAiInputWindow() {
  const win = createAiInputWindow();
  positionAiInputNearBall();
  win.show();
  win.focus();
  sendAiInputFocus(win);
}

// ---------- 首次启动协议同意 ----------
// 修改协议内容时把版本 +1，用户下次启动会重新看到同意页
const AGREEMENT_VERSION = 1;
let consentWindow = null;

function needsConsent() {
  return Number(store.get('consentVersion') || 0) < AGREEMENT_VERSION;
}

function createConsentWindow() {
  if (consentWindow && !consentWindow.isDestroyed()) {
    consentWindow.show();
    consentWindow.focus();
    return consentWindow;
  }
  consentWindow = new BrowserWindow({
    width: 560,
    height: 640,
    minWidth: 460,
    minHeight: 520,
    resizable: true,
    transparent: false,
    frame: true,
    title: '欢迎使用 · 今日运势',
    backgroundColor: '#141019',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  consentWindow.setMenuBarVisibility(false);
  consentWindow.loadFile(path.join(__dirname, 'src', 'consent.html'));
  consentWindow.once('ready-to-show', () => consentWindow.show());
  consentWindow.on('closed', () => { consentWindow = null; });
  // 未同意就关窗 → 退出应用
  consentWindow.on('close', () => {
    if (needsConsent()) {
      isQuitting = true;
      setTimeout(() => app.quit(), 50);
    }
  });
  return consentWindow;
}

// ---------- 法律与隐私窗口 ----------
let legalWindow = null;
function createLegalWindow(docKey) {
  const key = ['privacy', 'terms', 'disclaimer', 'thirdparty'].includes(docKey) ? docKey : 'privacy';
  if (legalWindow && !legalWindow.isDestroyed()) {
    legalWindow.loadFile(path.join(__dirname, 'src', 'legal.html'), { search: 'doc=' + key });
    legalWindow.show();
    legalWindow.focus();
    return legalWindow;
  }
  legalWindow = new BrowserWindow({
    width: 760,
    height: 740,
    minWidth: 480,
    minHeight: 420,
    transparent: false,
    frame: true,
    title: '法律与隐私',
    backgroundColor: '#141019',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  legalWindow.setMenuBarVisibility(false);
  legalWindow.loadFile(path.join(__dirname, 'src', 'legal.html'), { search: 'doc=' + key });
  legalWindow.once('ready-to-show', () => legalWindow.show());
  legalWindow.on('closed', () => { legalWindow = null; });
  return legalWindow;
}

// ---------- 精灵面板 ----------
let petPanelWindow = null;
function createPetPanelWindow() {
  try {
    return _createPetPanelWindowImpl();
  } catch (e) {
    logger.error('main.window', `createPetPanelWindow failed: ${e.message}`);
    throw e;
  }
}
function _createPetPanelWindowImpl() {
  if (petPanelWindow && !petPanelWindow.isDestroyed()) {
    petPanelWindow.show();
    petPanelWindow.focus();
    return petPanelWindow;
  }
  petPanelWindow = new BrowserWindow({
    width: 340,
    height: 460,
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
  if (typeof petPanelWindow.setExcludedFromAltTab === 'function') {
    petPanelWindow.setExcludedFromAltTab(true);
  }
  petPanelWindow.setMenuBarVisibility(false);
  petPanelWindow.loadFile(path.join(__dirname, 'src', 'petPanel.html'));
  petPanelWindow.on('blur', () => {
    if (petPanelWindow && !petPanelWindow.isDestroyed()) petPanelWindow.hide();
  });
  petPanelWindow.on('closed', () => { petPanelWindow = null; });
  return petPanelWindow;
}

// 精灵面板定位：贴在球旁边
function positionPetPanelNearBall() {
  if (!petPanelWindow || petPanelWindow.isDestroyed()) return;
  const pos = getBallScreenPos();
  const work = screen.getPrimaryDisplay().workArea;
  const w = 340, h = 460;
  let x = pos.x + BALL_SIZE + 8;
  if (x + w > work.x + work.width) x = pos.x - w - 8;
  if (x < work.x) x = work.x + 8;
  let y = pos.y;
  if (y + h > work.y + work.height) y = work.y + work.height - h - 8;
  if (y < work.y) y = work.y + 8;
  petPanelWindow.setPosition(Math.round(x), Math.round(y));
}

// ---------- 桌面形象 ----------
const PERSONAS = {
  cat: '猫',
  dog: '狗',
  caishen: '财神',
  lots: '签筒',
};
function broadcastPersona(name) {
  if (ballWindow && !ballWindow.isDestroyed()) {
    try { ballWindow.webContents.send('persona-changed', name); } catch {}
  }
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

  const st = store.get('streak') || { count: 0 };
  tray.setToolTip(st.count > 1 ? `今日运势 · 连续 ${st.count} 天` : '今日运势');
  rebuildTrayMenu();
}

// 托盘菜单触发抽签（复用球的 draw-fortune 流程）
function triggerDraw(scope) {
  if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
  ballWindow.show();
  ballWindow.focus();
  ballWindow.webContents.send('shortcut-draw', scope);
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
        // 走 IPC 同一条路径：窗口尚未加载完时也能在加载后补发历史
        if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
        ballWindow.show();
        ballWindow.focus();
        openAiInputWindow();
      },
    },
    { type: 'separator' },
    {
      label: '黄历测算',
      submenu: [
        { label: '今日黄历', click: () => triggerDraw('today') },
        { label: '明日黄历', click: () => triggerDraw('tomorrow') },
        { label: '本周黄历', click: () => triggerDraw('week') },
      ],
    },
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
      label: '桌面形象',
      submenu: Object.entries(PERSONAS).map(([key, label]) => ({
        label,
        type: 'radio',
        checked: (store.get('persona') || 'cat') === key,
        click: () => {
          store.set('persona', key);
          logger.info('persona', 'tray set ' + key);
          broadcastPersona(key);
          rebuildTrayMenu();
        },
      })),
    },
    {
      label: '每日提醒',
      submenu: [
        {
          label: '开启每日一签提醒',
          type: 'checkbox',
          checked: (store.get('dailyReminder') || {}).enabled === true,
          click: (item) => {
            const cfg = store.get('dailyReminder') || {};
            store.set('dailyReminder', { ...cfg, enabled: item.checked });
            rebuildTrayMenu();
            scheduleDailyReminder();
            logger.info('reminder', 'enabled=' + item.checked);
          },
        },
        { type: 'separator' },
        ...['08:00', '09:00', '12:00', '18:00', '21:00'].map((time) => ({
          label: time,
          type: 'radio',
          checked: ((store.get('dailyReminder') || {}).time || '09:00') === time,
          click: () => {
            const cfg = store.get('dailyReminder') || {};
            store.set('dailyReminder', { ...cfg, time, enabled: true });
            rebuildTrayMenu();
            scheduleDailyReminder();
            logger.info('reminder', 'time=' + time);
          },
        })),
      ],
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
      click: async () => {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          buttons: ['取消', '清空'],
          defaultId: 0,
          cancelId: 0,
          title: '清空日志',
          message: '确定清空所有日志？',
        });
        if (response === 1) {
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
    // 注意：不要传 args。打包后 setLoginItemSettings 默认指向应用 exe，
    // 传 ['--hidden'] 会在部分 Windows 版本上变成 "electron.exe --hidden" 而无法启动。
    app.setLoginItemSettings({ openAtLogin: !!enabled });
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
    lastPersistedPos = clamped;
    if (positionSaveTimer) { clearTimeout(positionSaveTimer); positionSaveTimer = null; }
    store.set('position', clamped);
    return clamped;
  });

  // renderer 同步球的当前 transform 位置给主进程（用于 ignore-mouse 决策）
  // 注意：这是 60fps 高频通道，不能走 logIpcStart，否则日志会被刷爆
  ipcMain.handle('update-ball-pos', (_e, x, y) => {
    if (typeof x === 'number' && typeof y === 'number') {
      // 取整，避免浮点坐标传给 Electron 原生方法（setPosition/BrowserWindow）导致 conversion failure
      currentBallPos = { x: Math.round(x), y: Math.round(y) };
      // 拖动结束/关闭时渲染端可能来不及发 save-position，这里兜底落盘
      if (!lastPersistedPos ||
          lastPersistedPos.x !== currentBallPos.x ||
          lastPersistedPos.y !== currentBallPos.y) {
        persistBallPosition(currentBallPos.x, currentBallPos.y);
      }
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
  // 渲染端打开/关闭菜单时上报外接矩形，扩大/恢复鼠标热区
  ipcMain.on('set-hit-region', (_e, rect) => {
    try {
      if (rect && [rect.x, rect.y, rect.w, rect.h].every((n) => typeof n === 'number' && isFinite(n))) {
        ballHitRegion = { x: rect.x, y: rect.y, w: Math.max(1, rect.w), h: Math.max(1, rect.h) };
        lastIgnoreState = null; // 强制下一轮重新判定
        logger.info('main.hitRegion', 'enabled ' + JSON.stringify(ballHitRegion));
      } else {
        ballHitRegion = null;
        lastIgnoreState = null;
        logger.info('main.hitRegion', 'disabled');
      }
    } catch (e) {
      logger.warn('main.hitRegion', 'bad rect: ' + e.message);
    }
  });

  handle('set-ignore-mouse', (_e, ignore) => {
    if (!ballWindow || ballWindow.isDestroyed()) return false;
    ballWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
    return true;
  });

  // ---------- 运势 ----------
  handle('draw-fortune', (_e, options = {}) => {
    const { deferCard = false, scope = 'today', force = false } = options;
    const todayKey = fortune.getTodayKey();
    const cached = store.get('todayFortune') || {};
    // 应用运势精灵加持（五项维度加分）
    const applyBoost = (data) => {
      try {
        const s = getSpirit();
        const boosts = s.boosts || {};
        const applied = [];
        // 逐维度加分到 dims
        for (const dim of spirit.DIMENSIONS) {
          const b = boosts[dim] || 0;
          if (b <= 0) continue;
          const fields = spirit.DIM_FIELDS[dim] || [];
          for (const field of fields) {
            if (field === 'score') continue; // 综合单独处理
            if (data.dims && typeof data.dims[field] === 'number') {
              const cap = data.dims[field] > 100 ? 100 : 5;
              data.dims[field] = Math.min(cap, data.dims[field] + b);
            }
          }
          applied.push(`${dim}+${b}`);
        }
        // 综合加持 → 总分
        const totalBoost = boosts['综合'] || 0;
        if (totalBoost > 0 && typeof data.score === 'number') {
          data.score = Math.min(5, data.score + totalBoost);
        }
        data.boost = {
          applied,              // ['财运+1','事业+1']
          boosts,               // 完整加持表
          posWuxing: getCurrentPosWuxing(),
        };
      } catch (e) {
        logger.warn('spirit.boost', `apply failed: ${e.message}`);
      }
      return data;
    };

    // 给卡片数据附带精灵加持后的副本；缓存里的原始数据不动，否则每次打开都会重复加分
    const withBoost = (style, score, data) => {
      try {
        return applyBoost(JSON.parse(JSON.stringify(data || {})));
      } catch (e) {
        logger.warn('spirit.boost', `clone failed: ${e.message}`);
        return applyBoost(data);
      }
    };

    // AI 解读在这里同步发起（早于 showCard 的异步 IPC），
    // 确保返回前渲染端已经有 card-data，不会出现「解读先到、卡片后渲染」被清掉的竞态。
    // 注意：传进来的 data 已由 withBoost 生成副本，这里不要再 applyBoost，否则会重复加分。
    const showCard = (style, score, data, aiVariant = 'cached') => {
      if (deferCard) return;
      const pos = getBallScreenPos();
      const win = createCardWindow(pos.x, pos.y);
      win._stayOpen = true;
      cardCurrentStyle = style;
      queueCardData({ style, score: data.score, fortune: data });
      win.show();
      win.focus();
      setTimeout(() => { if (win && !win.isDestroyed()) win._stayOpen = false; }, 500);
      tryAppendAiInterpretation(style, score, data, todayKey, aiVariant);
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
        const view = withBoost('moment', entry.score, entry.data);
        showCard('moment', view.score, view, 'cached');
        return { style: 'moment', score: view.score, fortune: view, cached: true };
      }
      const data = fortune.genHourFortune({ dateKey: todayKey, hourKey, profile: store.get('profile'), installId: store.get('installId') });
      momentCache[cacheKey] = { score: data.score, data, ts: Date.now() };
      // 清理 7 天前的
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(momentCache)) {
        if (momentCache[k].ts < cutoff) delete momentCache[k];
      }
      store.set('momentCache', momentCache);
      const view = withBoost('moment', data.score, data);
      showCard('moment', view.score, view, 'fresh');
      return { style: 'moment', score: view.score, fortune: view, cached: false };
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
        const view = withBoost('tomorrow', entry.score, entry.data);
        showCard('tomorrow', view.score, view, 'cached');
        return { style: 'tomorrow', score: view.score, fortune: view, cached: true };
      }
      const data = fortune.genTomorrowFortune({ dateKey: tomorrowKey, installId: store.get('installId') });
      tomorrowCache[tomorrowKey] = { score: data.score, data, ts: Date.now() };
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(tomorrowCache)) {
        if (tomorrowCache[k].ts < cutoff) delete tomorrowCache[k];
      }
      store.set('tomorrowCache', tomorrowCache);
      const view = withBoost('tomorrow', data.score, data);
      showCard('tomorrow', view.score, view, 'fresh');
      return { style: 'tomorrow', score: view.score, fortune: view, cached: false };
    }

    // ===== scope=week: 本周（按 ISO 周缓存）=====
    if (scope === 'week') {
      const isoWeek = fortune.getIsoWeek(new Date());
      const weekCache = store.get('weekCache') || {};
      logger.info('main.drawFortune', `scope=week iso=${isoWeek}`);
      if (weekCache[isoWeek]) {
        const entry = weekCache[isoWeek];
        logger.info('main.drawFortune', `scope=week cached`);
        const view = withBoost('week', entry.score, entry.data);
        showCard('week', view.score, view, 'cached');
        return { style: 'week', score: view.score, fortune: view, cached: true };
      }
      const data = fortune.genWeekFortune({ dateKey: todayKey, installId: store.get('installId') });
      weekCache[isoWeek] = { score: data.score, data, ts: Date.now() };
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(weekCache)) {
        if (weekCache[k].ts < cutoff) delete weekCache[k];
      }
      store.set('weekCache', weekCache);
      const view = withBoost('week', data.score, data);
      showCard('week', view.score, view, 'fresh');
      return { style: 'week', score: view.score, fortune: view, cached: false };
    }

    // ===== scope=profile: 个人测算 =====
    if (scope === 'profile') {
      const profile = store.get('profile') || {};
      const profileMode = store.get('profileMode') || 'comprehensive';
      logger.info('main.drawFortune', `scope=profile mode=${profileMode} hasBirthday=${!!profile.birthday}`);
      if (!profile.birthday) {
        // 未填生日 → 返回引导（前端渲染错误态）
        return { style: 'profile', score: 0, fortune: { error: 'NO_BIRTHDAY' }, cached: false };
      }
      // 个人运势按「生日 + 形态 + 当天」缓存；旧 key 没带日期，跨天后会一直返回昨天的结果
      const cacheKey = `profile|${profile.birthday}|${profileMode}|${todayKey}`;
      const profileCache = store.get('profileCache') || {};
      if (profileCache[cacheKey]) {
        const entry = profileCache[cacheKey];
        logger.info('main.drawFortune', 'scope=profile cached');
        const view = withBoost('profile', entry.score, entry.data);
        showCard('profile', view.score, view);
        return { style: 'profile', score: view.score, fortune: view, cached: true };
      }
      const data = fortune.genProfile({ dateKey: todayKey, profile, profileMode });
      profileCache[cacheKey] = { score: data.score, data, ts: Date.now() };
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const k of Object.keys(profileCache)) {
        if (profileCache[k].ts < cutoff) delete profileCache[k];
      }
      store.set('profileCache', profileCache);
      const view = withBoost('profile', data.score, data);
      showCard('profile', view.score, view);
      return { style: 'profile', score: view.score, fortune: view, cached: false };
    }

    // ===== scope=today（默认）: 沿用第一/二阶段逻辑 =====
    // 换一换（force）：跳过当天缓存，换一种风格重新生成，并覆盖当天的缓存
    if (force) {
      const prevStyle = cached[todayKey] && cached[todayKey].style;
      // 临时把上一风格的行为分压低，确保换到不同风格
      const bmap = store.get('behavior') || {};
      if (prevStyle) {
        const cur = bmap[prevStyle] || { clicks: 0, view_seconds: 0, last_seen: 0 };
        cur.last_seen = 0;
        bmap[prevStyle] = cur;
      }
      const style = behavior.pickStyle(bmap);
      logger.info('main.drawFortune', `scope=today force from=${prevStyle || 'none'} to=${style}`);
      const totalClicks = behavior.STYLES.reduce(
        (sum, st) => sum + ((bmap[st] && bmap[st].clicks) || 0), 0
      );
      const ranked = behavior.STYLES.map(st => ({
        s: st,
        v: ((bmap[st] && bmap[st].clicks) || 0) * 1 +
           ((bmap[st] && bmap[st].view_seconds) || 0) * 0.01,
      })).sort((a, b) => b.v - a.v).slice(0, 2).map(x => x.s);
      const data = fortune.generate(style, {
        dateKey: todayKey,
        zodiac: store.get('zodiac'),
        totalClicks,
        topStyles: ranked,
        installId: store.get('installId'),
      });
      data.almanac = fortune.genAlmanac({ dateKey: todayKey });
      data.styleLabel = '今日黄历';
      cached[todayKey] = { style, score: data.score, data };
      store.set('todayFortune', cached);
      behavior.recordInteraction(bmap, style, 0);
      store.set('behavior', bmap);
      const view = withBoost(style, data.score, data);
      showCard(style, view.score, view, 'fresh');
      return { style, score: view.score, fortune: view, cached: false, rerolled: true };
    }
    // 当日已有缓存 → 直接返回 + 记录行为
    if (cached[todayKey]) {
      const entry = cached[todayKey];
      const behaviorMap = store.get('behavior') || {};
      behavior.recordInteraction(behaviorMap, entry.style, 0);
      store.set('behavior', behaviorMap);
      logger.info('main.drawFortune', `scope=today cached style=${entry.style}`);
      recordStreak();
      const view = withBoost(entry.style, entry.score, entry.data);
      showCard(entry.style, view.score, view, 'cached');
      return { style: entry.style, score: view.score, fortune: view, cached: true };
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
      installId: store.get('installId'),
    });
    // 叠加今日黄历 + 改标题
    data.almanac = fortune.genAlmanac({ dateKey: todayKey });
    data.styleLabel = '今日黄历';
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
    const view = withBoost(style, data.score, data);
    recordStreak();
    showCard(style, view.score, view);
    return { style, score: view.score, fortune: view, cached: false };
  });

  // 单独控制卡片显示（球的真实抽签路径：先 deferCard 拿数据，再弹卡）
  handle('show-fortune-card', (_e, style, score, fortuneData, ballX, ballY, reveal = false) => {
    if (typeof style !== 'string') return false;
    const win = createCardWindow(ballX, ballY);
    win._stayOpen = true;
    win._aiPending = false; // 新卡片：清掉上一张遗留的 AI 写入保护
    cardCurrentStyle = style;
    queueCardData({ style, score, fortune: fortuneData, reveal: !!reveal });
    win.show();
    win.focus();
    setTimeout(() => { if (win && !win.isDestroyed()) win._stayOpen = false; }, 500);
    // 这条路径 draw-fortune 用了 deferCard，不会自动带 AI 解读，这里补上
    tryAppendAiInterpretation(style, score, fortuneData, fortune.getTodayKey(), 'cached');
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
    // 每次打开都重新计时，否则新卡片会沿用上一张的打开时间
    cardOpenedAt = Date.now();
    return true;
  });
  // card-closed：保留以兼容 card.js 的旧调用，但实际逻辑统一走 closeCardWindow
  handle('card-closed', (_e, style) => {
    if (typeof style === 'string') cardCurrentStyle = style;
    closeCardWindow();
    return true;
  });

  // ---------- 模型管理（设置面板填写优先，空白回退 .env）----------

  handle('get-llm-status', async () => {
    const cfg = await resolveAiConfig();
    return {
      source: cfg.source,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      hasToken: !!cfg.token,
    };
  });

  handle('get-online-ai-config', () => {
    const saved = store.get('aiConfig') || {};
    const merged = onlineConfig.resolve(saved, { preferEnv: !app.isPackaged });
    const hasUserToken = !!(saved.token && String(saved.token).trim()) && merged.tokenSource === 'user';
    return {
      baseUrl: saved.baseUrl || merged.baseUrl || '',
      model: saved.model || merged.model || '',
      hasToken: !!merged.token,
      tokenHint: onlineConfig.maskToken(merged.token),
      fromEnv: merged.tokenSource === 'env',
      fromBundled: merged.tokenSource === 'bundled',
      tokenSource: merged.tokenSource || 'none',
    };
  });

  handle('save-online-ai-config', (_e, payload = {}) => {
    const prev = store.get('aiConfig') || {};
    const nextToken = typeof payload.token === 'string' ? payload.token.trim() : '';
    const next = {
      baseUrl: typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : (prev.baseUrl || ''),
      model: typeof payload.model === 'string' ? payload.model.trim() : (prev.model || ''),
      token: nextToken || prev.token || '',
    };
    store.set('aiConfig', next);
    logger.info('aiConfig', `saved model=${next.model} baseUrl=${next.baseUrl} hasToken=${!!next.token}`);
    return {
      ok: true,
      tokenHint: onlineConfig.maskToken(onlineConfig.resolve(next, { preferEnv: !app.isPackaged }).token),
      tokenSource: onlineConfig.resolve(next, { preferEnv: !app.isPackaged }).tokenSource,
    };
  });

  // 清除设置面板里保存的 Key，回退到 .env（如果 .env 里也有）
  handle('clear-online-ai-token', () => {
    const prev = store.get('aiConfig') || {};
    store.set('aiConfig', { baseUrl: prev.baseUrl || '', model: prev.model || '', token: '' });
    logger.info('aiConfig', 'saved token cleared');
    const merged = onlineConfig.resolve(store.get('aiConfig'));
    return { ok: true, hasToken: !!merged.token, fromEnv: !merged.token || !!onlineConfig.token };
  });

  handle('test-online-ai', async () => {
    const cfg = await resolveAiConfig();
    return ai.testConnection({ baseUrl: cfg.baseUrl, token: cfg.token, model: cfg.model });
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

  // ---------- 个人测算 ----------
  handle('save-profile', (_e, profile = {}) => {
    const next = {
      birthday: typeof profile.birthday === 'string' ? profile.birthday : null,
      gender: ['male', 'female', ''].includes(profile.gender) ? profile.gender : '',
    };
    store.set('profile', next);
    // 同时推导写入顶层 zodiac（兼容现有 tarot / AI 读取）
    if (next.birthday) {
      try {
        const [y, m, d] = next.birthday.split('-').map(Number);
        const zodiac = require('./src/js/data/tarot').getZodiac(m, d);
        store.set('zodiac', zodiac.key);
        logger.info('profile', `saved birthday=${next.birthday} gender=${next.gender} zodiac=${zodiac.key}`);
      } catch (e) {
        logger.warn('profile', `derive zodiac failed: ${e.message}`);
      }
    }
    return true;
  });

  handle('get-profile', () => store.get('profile') || { birthday: null, gender: '' });

  handle('set-profile-mode', (_e, mode) => {
    const v = ['comprehensive', 'bazi', 'zodiac'].includes(mode) ? mode : 'comprehensive';
    store.set('profileMode', v);
    logger.info('profile', `mode set to ${v}`);
    return true;
  });

  handle('get-profile-mode', () => store.get('profileMode') || 'comprehensive');

  // ---------- 运势精灵 ----------
  // 获取当前加持状态
  handle('get-spirit', () => {
    const s = getSpirit();
    const posWuxing = getCurrentPosWuxing();
    return {
      boosts: s.boosts,
      blessRemaining: spirit.BLESS_DAILY_LIMIT - (s.lastBlessDate === fortune.getTodayKey() ? s.blessCountToday : 0),
      posWuxing,
      posDim: spirit.WUXING_TO_DIM[posWuxing] || null,
    };
  });

  // 祈福：指定维度加持 +1
  handle('bless-spirit', (_e, dim) => {
    let s = getSpirit();
    const result = spirit.bless(s, dim, fortune.getTodayKey(), Date.now());
    saveSpirit(result.spirit);
    if (result.error) {
      logger.warn('spirit.bless', `dim=${dim} error=${result.error}`);
      return { ok: false, error: result.error };
    }
    logger.info('spirit.bless', `dim=${dim} +1 → ${result.boost}`, { remaining: result.remaining });
    return { ok: true, dim, boost: result.boost, remaining: result.remaining, boosts: result.spirit.boosts };
  });

  handle('get-streak', () => {
    const st = store.get('streak') || streak.defaultStreak();
    return { count: st.count || 0, best: st.best || 0, lastDate: st.lastDate || '' };
  });

  handle('get-persona', () => (PERSONAS[store.get('persona')] ? store.get('persona') : 'cat'));

  handle('set-persona', (_e, name) => {
    const next = PERSONAS[name] ? name : 'cat';
    store.set('persona', next);
    logger.info('persona', 'set to ' + next);
    broadcastPersona(next);
    rebuildTrayMenu();
    return next;
  });

  handle('accept-consent', () => {
    const wasFirstRun = needsConsent();
    store.set('consentVersion', AGREEMENT_VERSION);
    logger.info('consent', 'version=' + AGREEMENT_VERSION);
    if (wasFirstRun) app.emit('consent-accepted');
    if (consentWindow && !consentWindow.isDestroyed()) {
      // 允许正常关闭
      consentWindow.removeAllListeners('close');
      consentWindow.close();
    }
    return true;
  });

  handle('quit-app', () => {
    isQuitting = true;
    app.quit();
    return true;
  });

  handle('open-legal', (_e, key) => {
    createLegalWindow(key);
    return true;
  });

  handle('open-settings', () => {
    createSettingsWindow();
    return true;
  });

  // 设置面板的「预览动画」：在球上触发一次带全屏动画的今日抽签
  handle('preview-ball-anim', () => {
    if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
    ballWindow.show();
    ballWindow.focus();
    // 等球窗口加载完成再发，避免首次预览时事件丢失
    if (ballWindow.webContents.isLoading()) {
      ballWindow.webContents.once('did-finish-load', () => {
        ballWindow.webContents.send('shortcut-draw', { scope: 'today', animate: true });
      });
    } else {
      ballWindow.webContents.send('shortcut-draw', { scope: 'today', animate: true });
    }
    logger.info('main.anim', 'preview requested');
    return true;
  });

  // ---------- AI 浮窗 ----------
  handle('open-ai-input', () => {
    openAiInputWindow();
    return true;
  });

  handle('reset-agent-chat', () => {
    clearAgentChat();
    logger.info('agent.reset', 'history cleared');
    return { ok: true, messages: [] };
  });

  // 打开精灵面板
  handle('open-pet-panel', () => {
    const win = createPetPanelWindow();
    positionPetPanelNearBall();
    win.show();
    win.focus();
    return true;
  });

  handle('close-ai-input', () => {
    if (aiInputWindow && !aiInputWindow.isDestroyed()) aiInputWindow.hide();
    return true;
  });

  // 用户在浮窗提交提问 → 调模型 → 弹卡片显示
  handle('ai-interpret-ask', async (_e, payload = {}) => {
    // 个人测算"解算"：对当前档案做一次深度 AI 解读，返回文本（由卡片追加显示）
    if (payload.profile === true) {
      const profile = store.get('profile') || {};
      const profileMode = store.get('profileMode') || 'comprehensive';
      if (!profile.birthday) return { ok: false, error: 'NO_BIRTHDAY' };
      const aiCfg = await resolveAiConfig();
      if (!aiCfg.token) return { ok: false, error: 'NO_TOKEN' };
      try {
        const data = fortune.genProfile({
          dateKey: fortune.getTodayKey(),
          profile,
          profileMode,
        });
        const { result } = await withAiFallback((cfg) => ai.interpretFortune({
          style: 'profile',
          fortuneData: data,
          ctx: { dateKey: fortune.getTodayKey(), zodiac: store.get('zodiac') },
          aiConfig: cfg,
        }));
        logger.info('ai.profileDecode', `tokens=${result.usage.total_tokens || '?'}`);
        return { ok: true, text: result.text };
      } catch (e) {
        const msg = String(e.message || e);
        logger.error('ai.profileDecode', msg);
        return { ok: false, error: msg };
      }
    }

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

    const ctx = {
      todayKey: fortune.getTodayKey(),
      profile: store.get('profile') || {},
      profileMode: store.get('profileMode') || 'comprehensive',
      spirit: getSpirit(),
      saveSpirit,
      behaviorMap: store.get('behavior') || {},
      zodiac: store.get('zodiac'),
      posWuxing: getCurrentPosWuxing(),
      scene: agentScene,
      installId: store.get('installId'),
    };

    const sendProgress = (info) => {
      if (aiInputWindow && !aiInputWindow.isDestroyed()) {
        aiInputWindow.webContents.send('ai-agent-progress', info);
      }
    };

    try {
      const { result, usedFallback } = await withAiFallback((cfg) => agent.runAgent({
        history: agentHistory,
        userQuery: query,
        aiConfig: cfg,
        ctx,
        callLLM: ai.callLLM,
        onProgress: sendProgress,
      }));
      agentHistory = result.history || [];
      agentScene = result.scene || '';
      saveAgentChat();
      logger.info('agent.chat', `scene=${agentScene || 'none'} tools=${(result.toolsUsed || []).join(',') || 'none'} tokens=${result.usage.total_tokens || '?'} fallback=${usedFallback}`);
      return {
        ok: true,
        text: result.text,
        toolsUsed: result.toolsUsed || [],
        citations: result.citations || [],
        notice: usedFallback ? aiFallbackNotice : '',
      };
    } catch (e) {
      const msg = String(e.message || e);
      logger.error('agent.chat', msg, { query: query.slice(0, 50) });
      if (aiInputWindow && !aiInputWindow.isDestroyed()) {
        aiInputWindow.webContents.send('ai-input-error', {
          kind: msg,
          text: friendlyError(msg),
        });
      }
      return { ok: false, error: msg };
    }
  });
}

function sendAiInputFocus(win) {
  if (!win || win.isDestroyed()) return;
  const payload = { messages: agent.publicHistory(agentHistory) };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      if (!win.isDestroyed()) win.webContents.send('ai-input-focus', payload);
    });
  } else {
    win.webContents.send('ai-input-focus', payload);
  }
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
    AGENT_MAX_STEPS: '这轮调用太长，请换个说法再问',
    INSUFFICIENT_BALANCE: 'AI 额度已用尽，请充值或在设置里换用自己的 Key',
    UPSTREAM_ERROR: '模型服务返回错误，稍后再试',
    BAD_JSON: '模型返回格式异常，稍后重试',
    NO_MESSAGES: '请求内容为空',
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
// aiVariant：cached / fresh。云端缓存按（日期 + 风格 + 加持后结果）存，
// 否则祈福或摆位改变了结果，AI 还在按昨天的旧分数解读。
// 本地 Ollama 不缓存：用户换成本地模型后不应看到之前的线上解读。
async function tryAppendAiInterpretation(style, score, fortuneData, dateKey, aiVariant = 'cached') {
  const aiCfg = await resolveAiConfig();
  // 没配置 Key：在卡片上显示提示（可点击去设置），而不是静默
  if (!aiCfg.token) {
    sendAiStatusToCard(style, 'NO_TOKEN', 'AI 解读未配置，点此去设置');
    return;
  }

  // 只解读用户能看到的五种风格（moment/profile 等没有专用 prompt）
  const PROMPTED_STYLES = ['traditional', 'modern', 'lots', 'tarot', 'personalized'];
  if (!PROMPTED_STYLES.includes(style)) {
    logger.info('ai.interpretFortune', `skip style=${style} (no prompt)`);
    return;
  }
  markAiPending(style, true);

  // 缓存命中 → 直接发；写回前校验卡片是否还是同一张
  const aiCache = store.get('aiCache') || {};
  const entry = aiCache[dateKey] && aiCache[dateKey][style];
  const cacheKey = aiVariant === 'cached' ? String(score) : '';
  const cached = cacheKey && entry && entry.byKey && entry.byKey[cacheKey]
    ? entry.byKey[cacheKey]
    : null;
  if (cached && cached.text) {
    markAiPending(style, false);
    sendAiInterpretationToCard(style, cached.text, cached.usage, 'cache');
    return;
  }

  try {
    const { result } = await withAiFallback((cfg) => ai.interpretFortune({
      style,
      fortuneData,
      ctx: {
        dateKey,
        zodiac: store.get('zodiac'),
      },
      aiConfig: cfg,
    }));
    // 写缓存（仅云端；本地模型不缓存）
    if (aiVariant === 'cached' && aiCfg.source === 'online') {
      if (!aiCache[dateKey] || typeof aiCache[dateKey] !== 'object') aiCache[dateKey] = {};
      const dayEntry = aiCache[dateKey][style] && aiCache[dateKey][style].byKey
        ? aiCache[dateKey][style]
        : { byKey: {} };
      dayEntry.byKey[cacheKey] = {
        text: result.text,
        usage: result.usage,
        ts: Date.now(),
      };
      aiCache[dateKey][style] = dayEntry;
      // 清理 7 天前
      const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
      for (const d of Object.keys(aiCache)) {
        const dayEntries = aiCache[d];
        let allOld = true;
        for (const s of Object.keys(dayEntries)) {
          const keys = (dayEntries[s] && dayEntries[s].byKey) || {};
          for (const k of Object.keys(keys)) {
            if (keys[k].ts < cutoff) delete keys[k];
            else allOld = false;
          }
          if (Object.keys(keys).length === 0) delete dayEntries[s];
        }
        if (allOld || Object.keys(dayEntries).length === 0) delete aiCache[d];
      }
      store.set('aiCache', aiCache);
    }
    sendAiInterpretationToCard(style, result.text, result.usage, 'live');
    console.log(`[AI] ${style} interpreted, tokens=${result.usage.total_tokens || '?'}`);
    logger.info('ai.interpretFortune', `${style} tokens=${result.usage.total_tokens || '?'} source=${aiCfg.source}`);
  } catch (e) {
    console.warn(`[AI] skip interpretation for ${style}:`, e.message);
    logger.warn('ai.interpretFortune', `skip ${style}: ${e.message}`);
    // 失败降级：内置内容照常显示，卡片上给一条可点击的提示
    const friendly = String(e.message || '').startsWith('AUTH_FAILED')
      ? 'AI Key 已失效，点此去设置更新'
      : 'AI 解读暂时不可用，点此查看设置';
    sendAiStatusToCard(style, 'AI_FAILED', friendly);
  } finally {
    markAiPending(style, false);
  }
}

// AI 写入期间给卡片挂 pending 标记，避免失焦被关掉
function markAiPending(style, pending) {
  if (!cardWindow || cardWindow.isDestroyed()) return;
  if (cardCurrentStyle && cardCurrentStyle !== style) return;
  cardWindow._aiPending = !!pending;
}

// 把「AI 状态」作为一条系统气泡推给卡片（无 Key / 认证失败）
function sendAiStatusToCard(style, kind, text) {
  if (!cardWindow || cardWindow.isDestroyed()) return;
  if (cardCurrentStyle && cardCurrentStyle !== style) return;
  if (cardWindow.webContents.isLoading()) {
    cardWindow._pendingAiStatus = { style, kind, text };
    return;
  }
  cardWindow.webContents.send('ai-status', { style, kind, text });
}

// 把解读推给当前打开的卡片；卡片已换成别的风格时丢弃
function sendAiInterpretationToCard(style, text, usage, via) {
  if (!cardWindow || cardWindow.isDestroyed()) {
    logger.info('ai.push', `skip (no card) style=${style} via=${via}`);
    return;
  }
  if (cardCurrentStyle && cardCurrentStyle !== style) {
    logger.info('ai.push', `skip style=${style} (card now ${cardCurrentStyle})`);
    return;
  }
  const payload = { style, text, usage };
  if (cardWindow.webContents.isLoading()) {
    // 首次打开卡片：渲染端脚本/监听器还没就绪，直接 send 会丢；等 did-finish-load 再补发
    cardWindow._pendingAi = payload;
    logger.info('ai.push', `queued style=${style} via=${via}`);
    return;
  }
  cardWindow.webContents.send('ai-interpretation-ready', payload);
  logger.info('ai.push', `sent style=${style} via=${via}`);
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
    const ok = globalShortcut.register('CommandOrControl+Alt+F', () => {
      if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
      ballWindow.show();
      ballWindow.focus();
      // 触发抽签：通过 webContents 发个事件给渲染端
      ballWindow.webContents.send('shortcut-draw');
    });
    if (!ok) {
      logger.warn('shortcut', 'Ctrl+Alt+F 已被其他应用占用，全局抽签快捷键不可用');
    } else {
      logger.info('shortcut', 'Ctrl+Alt+F registered');
    }
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
    packaged: app.isPackaged,
  });
  // 启动诊断：确认 AI 配置来源（user / env / bundled / none），不记录 Key 本身
  try {
    const cfgNow = onlineConfig.resolve(store.get('aiConfig'), { preferEnv: !app.isPackaged });
    logger.info('main.aiConfig', 'resolved', {
      source: cfgNow.tokenSource,
      hasToken: !!cfgNow.token,
      model: cfgNow.model,
      resourcesPath: process.resourcesPath || '',
    });
  } catch (e) {
    logger.warn('main.aiConfig', 'resolve failed: ' + e.message);
  }
  registerIpc();
  registerLogIpc();
  // 首次启动（或协议版本升级）必须先同意用户协议/隐私政策
  if (needsConsent()) {
    logger.info('consent', 'required (version=' + AGREEMENT_VERSION + ')');
    createConsentWindow();
    // 托盘仍创建，方便用户从菜单退出
    createTray();
    // 同意后立即进入正常启动流程
    app.once('consent-accepted', () => {
      logger.info('consent', 'accepted, starting app');
      createBallWindow();
      registerShortcut();
      applyAutoStart(store.get('autoStart') === true);
      startCursorPolling();
      startWatcher();
      startSpiritAccum();
      scheduleDailyReminder();
      setTimeout(() => {
        selfCheck.runSelfCheck({
          logWatcher,
          onlineConfig,
          getOnlineToken: () => onlineConfig.resolve(store.get('aiConfig'), { preferEnv: !app.isPackaged }).token,
          localLLM,
          tray,
          ballWindow,
          globalShortcut,
        }).catch((e) => logger.warn('selfCheck', 'run failed: ' + e.message));
      }, 5000);
    });
    return;
  }
  createBallWindow();
  createTray();
  registerShortcut();
  applyAutoStart(store.get('autoStart') === true);
  startCursorPolling();
  startWatcher();
  startSpiritAccum();
  scheduleDailyReminder();

  // 启动 5 秒后跑一次自检（给窗口/托盘/快捷键留出初始化时间）
  setTimeout(() => {
    selfCheck.runSelfCheck({
      logWatcher,
      onlineConfig,
      getOnlineToken: () => onlineConfig.resolve(store.get('aiConfig'), { preferEnv: !app.isPackaged }).token,
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
  // 把待写入的位置立即落盘
  if (positionSaveTimer) { clearTimeout(positionSaveTimer); positionSaveTimer = null; }
  if (lastPersistedPos) {
    store.set('position', lastPersistedPos);
  } else if (ballWindow && !ballWindow.isDestroyed()) {
    const [x, y] = ballWindow.getPosition();
    store.set('position', clampPosition({ x, y }));
  }
});

app.on('will-quit', () => {
  logger.info('main.lifecycle', 'will-quit');
  try { globalShortcut.unregisterAll(); } catch {}
  if (cursorPollTimer) clearInterval(cursorPollTimer);
  if (spiritTimer) clearInterval(spiritTimer);
  if (dailyReminderTimer) clearTimeout(dailyReminderTimer);
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
    let isOver = cursor.x >= ballLeft && cursor.x <= ballRight &&
                 cursor.y >= ballTop  && cursor.y <= ballBottom;
    // 菜单打开：只要光标在「猫 + 面板」矩形内就继续接收鼠标，否则面板没法点击
    if (!isOver && ballHitRegion) {
      // 渲染端上报的是窗口内坐标，换算成屏幕坐标
      const r = ballHitRegion;
      const rx = bounds.x + r.x, ry = bounds.y + r.y;
      isOver = cursor.x >= rx && cursor.x <= rx + r.w &&
               cursor.y >= ry && cursor.y <= ry + r.h;
    }

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

// ---------- 每日一签提醒 ----------
let dailyReminderTimer = null;
let dailyReminderDayTimer = null;

function parseReminderTime(t) {
  const m = /^([01]?d|2[0-3]):([0-5]d)$/.exec(String(t || '').trim());
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

// 计算距离下一次提醒还有多少毫秒（本地时间）
function msUntilNextReminder(time) {
  const parsed = parseReminderTime(time) || { h: 9, m: 0 };
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parsed.h, parsed.m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function sendDailyReminder() {
  const cfg = store.get('dailyReminder') || {};
  if (!cfg.enabled) return;
  const todayKey = fortune.getTodayKey();
  if (cfg.lastNotifiedDate === todayKey) return; // 当天只提醒一次
  if (!Notification.isSupported()) return;
  const cached = (store.get('todayFortune') || {})[todayKey];
  const body = cached && cached.data
    ? '猫叼来今天的签了，点我看看。'
    : '猫在桌角等你，点我抽今天的签。';
  try {
    const n = new Notification({
      title: '今日运势 · 每日一签',
      body,
      silent: false,
    });
    n.on('click', () => {
      if (!ballWindow || ballWindow.isDestroyed()) createBallWindow();
      ballWindow.show();
      ballWindow.focus();
      ballWindow.webContents.send('shortcut-draw', 'today');
    });
    n.show();
    store.set('dailyReminder', { ...cfg, lastNotifiedDate: todayKey });
    logger.info('reminder', 'daily notification shown');
  } catch (e) {
    logger.warn('reminder', 'show failed: ' + e.message);
  }
}

function scheduleDailyReminder() {
  if (dailyReminderTimer) { clearTimeout(dailyReminderTimer); dailyReminderTimer = null; }
  const cfg = store.get('dailyReminder') || {};
  if (!cfg.enabled) return;
  const wait = Math.max(30 * 1000, Math.min(msUntilNextReminder(cfg.time), 24 * 3600 * 1000));
  dailyReminderTimer = setTimeout(() => {
    sendDailyReminder();
    scheduleDailyReminder(); // 安排下一天
  }, wait);
  logger.info('reminder', 'scheduled in ' + Math.round(wait / 1000) + 's');
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
