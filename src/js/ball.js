// ball.js - 悬浮球渲染器
// 设计要点：
// - 窗口是全屏透明的，body 走 pointer-events:none 让点击穿透到桌面
// - 球本身 pointer-events:auto，只有它能点击
// - 球的位置完全由 CSS transform 控制，零 IPC 即可丝滑拖拽/动画
// - 仅在拖拽结束时 IPC 落盘位置；卡片显示时再传一次球的屏幕坐标

const ball = document.getElementById('ball');
const ballInner = document.getElementById('ball-inner');

const BALL_SIZE = 80;

// ---------- 表情 ----------
// 5→大笑 4→微笑 3-2→不笑 1→哭
function setMood(score) {
  let mood = 'neutral';
  if (score >= 5) mood = 'laugh';
  else if (score >= 4) mood = 'smile';
  else if (score <= 1) mood = 'cry';
  ballInner.setAttribute('data-mood', mood);
}

// ---------- 颜色（CSS 变量驱动） ----------
function hexToRgb(hex) {
  const m = String(hex || '').replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return null;
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function setColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const { r, g, b } = rgb;
  ball.style.setProperty('--ball-light', rgbToHex(r + (255 - r) * 0.55, g + (255 - g) * 0.55, b + (255 - b) * 0.55));
  ball.style.setProperty('--ball-mid', rgbToHex(r, g, b));
  ball.style.setProperty('--ball-dark', rgbToHex(r * 0.75, g * 0.75, b * 0.75));
  ball.style.setProperty('--ball-shadow', `rgba(${r}, ${g}, ${b}, 0.4)`);
}
function applyFortune(fortune) {
  if (!fortune) return;
  if (typeof fortune.score === 'number') setMood(fortune.score);
  if (fortune.luckyColor && fortune.luckyColor.hex) setColor(fortune.luckyColor.hex);
}

// ---------- 位置（CSS transform） ----------
let posX = 0, posY = 0; // 当前 transform 位置（屏幕坐标）

// 位置同步给主进程（用于点击穿透决策 + 拖拽兜底落盘）。
// 用 rAF 合并到每帧最多一次：60fps 的 IPC + 主进程日志会拖慢拖拽并刷爆日志。
let posSyncPending = false;
function syncPosToMain() {
  if (posSyncPending) return;
  posSyncPending = true;
  requestAnimationFrame(() => {
    posSyncPending = false;
    window.api.updateBallPos(posX, posY);
  });
}

function setBallTransform(x, y, extra = '') {
  posX = x;
  posY = y;
  ball.style.transform = `translate(${x}px, ${y}px)${extra}`;
  syncPosToMain();
}

function getCurrentPos() {
  return { x: posX, y: posY };
}

// ---------- 拖拽（纯 transform，零 IPC） ----------
let dragState = null;

ball.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (isDrawing) return;
  e.preventDefault();
  // setPointerCapture 在部分输入设备/合成事件下会抛 NotFoundError，不能让它中断点击流程
  try { ball.setPointerCapture(e.pointerId); } catch {}
  dragState = {
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    startTime: Date.now(),
    moved: false,
    pointerId: e.pointerId,
    totalDx: 0,
    totalDy: 0,
    baseX: posX,
    baseY: posY,
  };
  window.logger.info('ball.drag', `start pos=${posX},${posY}`);
  ball.classList.remove('idle');
  ball.classList.add('grabbing');
});

ball.addEventListener('pointermove', (e) => {
  if (!dragState) return;
  const dx = e.clientX - dragState.lastX;
  const dy = e.clientY - dragState.lastY;
  dragState.lastX = e.clientX;
  dragState.lastY = e.clientY;
  if (Math.abs(e.clientX - dragState.startX) > 3 || Math.abs(e.clientY - dragState.startY) > 3) {
    dragState.moved = true;
  }
  if (dragState.moved) {
    dragState.totalDx += dx;
    dragState.totalDy += dy;
    setBallTransform(dragState.baseX + dragState.totalDx, dragState.baseY + dragState.totalDy);
    updateMenuLayout();
  }
});

ball.addEventListener('pointerup', async (e) => {
  if (!dragState) return;
  const wasMoved = dragState.moved;
  const elapsed = Date.now() - dragState.startTime;
  const pointerId = dragState.pointerId;
  dragState = null;
  try { ball.releasePointerCapture(pointerId); } catch {}

  window.logger.info('ball.drag', `end moved=${wasMoved} elapsed=${elapsed}ms pos=${posX},${posY}`);

  if (!wasMoved && elapsed < 300) {
    await handleClick();
  } else if (wasMoved) {
    // 仅在拖拽结束时 IPC 落盘位置
    await window.api.savePosition(posX, posY);
    updateOrbitEdges();
  }
  ball.classList.remove('grabbing');
  ball.classList.add('idle');
});

ball.addEventListener('pointercancel', () => {
  dragState = null;
  ball.classList.remove('grabbing');
  closeOrbitNow();
  ball.classList.add('idle');
});

// ---------- 右键 → AI 运势对话 ----------
ball.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (isDrawing) return;
  window.logger.info('ball.contextmenu', 'openAiInput');
  window.api.openAiInput();
});

// ---------- 猫边玻璃面板（四行入口） ----------
const menuItems = document.querySelectorAll('.menu-item');
const petMenu = document.getElementById('pet-menu');
// 开合闩：鼠标从猫移到面板时会经过空隙，单纯 :hover 会让菜单闪烁消失
let orbitLatchTimer = 0;
function openOrbit() {
  clearTimeout(orbitLatchTimer);
  updateMenuLayout(); // 位置可能在上一轮抽签/归位后变化，先刷新面板朝向
  ball.classList.add('orbit-open');
  scheduleHitReport();
}
function scheduleCloseOrbit() {
  clearTimeout(orbitLatchTimer);
  orbitLatchTimer = setTimeout(() => {
    orbitLatchTimer = 0;
    ball.classList.remove('orbit-open');
    scheduleHitReport();
  }, 220);
}
function closeOrbitNow() {
  clearTimeout(orbitLatchTimer);
  orbitLatchTimer = 0;
  ball.classList.remove('orbit-open');
  scheduleHitReport();
}
ball.addEventListener('pointerenter', openOrbit);
ball.addEventListener('pointerleave', scheduleCloseOrbit);
if (petMenu) {
  petMenu.addEventListener('pointerenter', openOrbit);
  petMenu.addEventListener('pointerleave', scheduleCloseOrbit);
}

menuItems.forEach((item) => {
  item.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止冒泡到球的 pointerup（避免触发普通 handleClick）
    e.preventDefault();
    const scope = item.getAttribute('data-scope');
    window.logger.info('ball.pickSign', `scope=${scope}`);
    handlePickSign(scope);
  });
  // 面板行上不能启动拖拽
  item.addEventListener('pointerdown', (e) => e.stopPropagation());
});

// 面板尺寸（CSS 里 --menu-w 236 / compact 152，高约 4×50 + padding）
const MENU_W = 236, MENU_H = 236, MENU_GAP = 18, MENU_MARGIN = 8;
const MENU_COMPACT_MAX = 200; // 按钮按「右侧、上对齐」估算的可用宽度：桌面宽 - 猫右边距 - 面板

// 根据猫的位置决定面板朝哪边滑出：
//   默认在右侧、底部对齐；右边放不下 → 左侧（用 bottom 对齐，避免向上长高）；
//   仍放不下 → 压缩成「图标 + 名称」两列
function updateMenuLayout() {
  if (!petMenu) return;
  const pos = getCurrentPos();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ballRight = pos.x + BALL_SIZE;
  const ballBottom = pos.y + BALL_SIZE;

  const roomRight = vw - ballRight - MENU_GAP - MENU_MARGIN;
  const roomLeft = pos.x - MENU_GAP - MENU_MARGIN;
  const roomAbove = ballBottom - MENU_MARGIN;

  let left = false;
  if (roomRight < MENU_W && roomLeft >= roomRight) left = true;

  const compact = (left ? roomLeft : roomRight) < MENU_W && (left ? roomLeft : roomRight) >= MENU_COMPACT_MAX;
  const width = compact ? 152 : MENU_W;

  // 若两侧都放不下（窄屏/贴边），保持右侧并压缩；再不济贴到屏幕边
  // 默认底部对齐（面板底边与猫底边齐平、向上展开）；猫贴近屏幕顶部时改为顶部对齐向下展开
  const up = roomAbove < MENU_H;
  petMenu.classList.toggle('menu-compact', compact);
  petMenu.classList.toggle('menu-up', up);
  petMenu.classList.toggle('menu-left', left);
  petMenu._width = width;
  petMenu._height = MENU_H;

  // 面板打开时把「猫 + 面板」的包围盒告诉主进程，扩大点击穿透热区
  if (ball.classList.contains('orbit-open')) scheduleHitReport();
}

// 把菜单打开时的外接矩形合成给主进程（默认只按猫身 ±40 判定）。
// 直接读面板的真实 rect，避免估算尺寸和 CSS 不一致
let lastRegion = '';
function reportHitRegion() {
  if (!petMenu) return;
  let region = null;
  if (ball.classList.contains('orbit-open')) {
    const r = petMenu.getBoundingClientRect();
    const b = ball.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      // #ball 带 translate，getBoundingClientRect 已经是窗口内（≈屏幕）坐标，不要再加 pos
      const x0 = Math.min(b.left, r.left);
      const y0 = Math.min(b.top, r.top);
      const x1 = Math.max(b.right, r.right);
      const y1 = Math.max(b.bottom, r.bottom);
      region = {
        x: Math.round(x0) - 10,
        y: Math.round(y0) - 10,
        w: Math.round(x1 - x0) + 20,
        h: Math.round(y1 - y0) + 20,
      };
    }
  }
  const key = region ? `${region.x},${region.y},${region.w},${region.h}` : 'none';
  if (key === lastRegion) return;
  lastRegion = key;
  try { window.api.setHitRegion(region); } catch {}
}

// 猫贴边时额外调整气泡/面板朝向（保留原有方法名，供拖拽结束调用）
function updateOrbitEdges() {
  const pos = getCurrentPos();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  ball.classList.toggle('edge-top', pos.y < 70);
  ball.classList.toggle('edge-bottom', pos.y + BALL_SIZE > vh - 46);
  ball.classList.toggle('edge-left', pos.x < 96);
  ball.classList.toggle('edge-right', pos.x + BALL_SIZE > vw - 24);
  updateMenuLayout();
}

// 面板开合/移动时节流上报热区（避免 80ms 轮询期间频繁 IPC）
let hitReportTimer = 0;
function scheduleHitReport() {
  if (hitReportTimer) return;
  hitReportTimer = setTimeout(() => {
    hitReportTimer = 0;
    reportHitRegion();
  }, 40);
}

async function handlePickSign(scope) {
  if (isDrawing) return;
  closeOrbitNow();
  reportHitRegion();
  // spirit 签：直接开精灵祈福面板，不抽签
  if (scope === 'spirit') {
    window.logger.info('ball.pickSign', 'spirit → open panel');
    window.api.openPetPanel();
    return;
  }
  await runDrawFlow({ scope });
}

// ---------- 点击 → 抽签动画 ----------
let isDrawing = false;
let cardOpenTime = 0;
// 动画前的原始位置（卡片关闭后球要回到这里）
let originalBallPos = null;

async function handleClick() {
  if (isDrawing) return;
  // 默认 scope = today（与第一/二阶段行为完全一致）
  // 只有「直接点击球体」播放全屏抽签动画；四签/托盘/快捷键直接弹卡
  await runDrawFlow({ scope: 'today', animate: true });
}

// 统一的抽签流程
async function runDrawFlow({ scope, animate = false }) {
  if (isDrawing) return;
  isDrawing = true;
  ball.classList.remove('idle');

  // 记下原始位置（reset 用）
  originalBallPos = getCurrentPos();

  window.logger.info('ball.draw', `started scope=${scope} animate=${animate}`);

  try {
    // 1. 先在主进程生成运势（不显示卡片，等数据就绪再显示）
    const result = await window.api.drawFortune({ deferCard: true, scope });
    if (!result) return;

    // 2. 应用运势（表情 + 颜色），配色会在后面的动画里用来生成粒子
    applyFortune(result.fortune);

    // 3. 全屏抽签动画（可关闭 / 系统减少动态效果时自动跳过）
    //    当天已经抽过（缓存命中）时仍播动画，但用更快的速度（约 2 秒）
    const cachedHit = !!(result && result.cached);
    if (animate && originalBallPos) {
      await playDrawAnimation({ scope, fortuneData: result.fortune, speed: cachedHit ? 1.7 : 1 });
    }

    // 4. 直接弹运势卡片（揭晓动画已合并进卡片入场）
    //    不再等待：粒子收束的同一时刻卡片就出现，避免中间的空档
    const cur = getCurrentPos();
    // reveal=true：卡片打开时带「揭晓」入场动画（替代原来的小揭晓卡）
    await window.api.showFortuneCard(result.style, result.score, result.fortune, cur.x, cur.y, true);
    cardOpenTime = Date.now();
    window.logger.info('ball.draw', `done scope=${scope} style=${result.style} score=${result.score}`);
  } catch (e) {
    console.error('抽签失败:', e);
    window.logger.error('ball.draw', `failed scope=${scope}: ${e.message}`);
  } finally {
    isDrawing = false;
    closeOrbitNow();
    ball.classList.add('idle');
  }
}

// 卡片关闭后，球动画归位到原始位置
function resetBallToOriginal() {
  if (!originalBallPos) return;
  const target = originalBallPos;
  originalBallPos = null;
  const start = getCurrentPos();
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const DIST = Math.hypot(dx, dy);
  // 距离太短就不动画，直接 set
  if (DIST < 5) {
    setBallTransform(target.x, target.y);
    window.api.savePosition(target.x, target.y);
    return;
  }
  const DURATION = Math.min(420, 200 + DIST * 0.3);
  const startTime = performance.now();
  function tick(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / DURATION);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    const x = Math.round(start.x + dx * eased);
    const y = Math.round(start.y + dy * eased);
    setBallTransform(x, y);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      setBallTransform(target.x, target.y);
      window.api.savePosition(target.x, target.y);
    }
  }
  requestAnimationFrame(tick);
}

window.api.onResetBall(() => {
  resetBallToOriginal();
});

// ---------- 抽签特效 ----------
// 具体绘制在 fx.js（窗口 FX），这里只负责：读设置 → 球体过渡 → 调 FX → 收尾复位
// 四签相对球心的方向（与 ball.css 里 .sign-chip 的位置对应），用来生成"四签粒子"
const CHIP_DIRS = [
  { dx: 0, dy: -46 },
  { dx: 46, dy: 0 },
  { dx: 0, dy: 46 },
  { dx: -46, dy: 0 },
];

// 读设置（缺省开启）；系统开启「减少动态效果」时强制关闭。
// 每次都读 store，用户在设置里切换后无需重启即可生效
async function animationsEnabled() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  try {
    const v = await window.api.getConfig('animations');
    return v !== false;
  } catch {
    return true;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function triggerScreenFlash(ms, strength) {
  const flash = document.getElementById('screen-flash');
  if (!flash) return;
  flash.style.setProperty('--flash-strength', String(strength == null ? 1 : strength));
  flash.classList.remove('active');
  void flash.offsetWidth; // 强制 reflow，连续抽签也能重新触发
  flash.classList.add('active');
  setTimeout(() => flash.classList.remove('active'), Math.max(300, ms || 700));
}

function currentPersona() {
  return (ballInner && ballInner.getAttribute('data-persona')) || 'cat';
}

// 签筒：放大摇一摇 → 一节签掉出来（CSS 动画，--as 控制速度）
async function playLotsAnimation(as, cx, cy) {
  ball.style.setProperty('--as', String(as));
  ball.classList.add('shaking');
  // 与 CSS 时长一致：0.28s 放大 + 4×0.5s 摇动 + 0.72s 签条飞出
  await wait(Math.round(2900 / as));
  triggerScreenFlash(220, 0.55);
  ball.classList.remove('shaking');
  window.logger.info('ball.anim', 'lots done');
}

// 财神：金光闪闪 → 「财神到」三个字依次现身（CSS 动画）
async function playCaishenAnimation(as, cx, cy) {
  ball.style.setProperty('--as', String(as));
  ball.classList.add('golden');
  // 与 CSS 时长一致：光束 0.7s + 第三个字 1.34s + 0.34s
  await wait(Math.round(1850 / as));
  triggerScreenFlash(260, 0.7);
  ball.classList.remove('golden');
  window.logger.info('ball.anim', 'caishen done');
}

async function playDrawAnimation({ scope, fortuneData, speed = 1 } = {}) {
  const enabled = await animationsEnabled();
  if (!enabled) {
    window.logger.info('ball.anim', 'skipped (disabled or reduced-motion)');
    return;
  }
  const c = getCurrentPos();
  // 各种形象的视觉中心：猫/狗略低于盒子中心，财神头在上、签筒整体居中
  const persona = currentPersona();
  const cx = c.x + BALL_SIZE / 2;
  const cy = c.y + BALL_SIZE * (persona === 'caishen' ? 0.42 : 0.56);
  const t0 = performance.now();
  const canvas = document.getElementById('fx');
  window.logger.info('ball.anim', `start scope=${scope} persona=${persona} center=${cx},${cy}`);

  try {
    ball.classList.remove('idle');

    // 签筒 / 财神：直接用各自专属动画，不散成粒子
    if (persona === 'lots' || persona === 'caishen') {
      if (persona === 'lots') await playLotsAnimation(speed, cx, cy);
      else await playCaishenAnimation(speed, cx, cy);
      window.logger.info('ball.anim', 'done ' + Math.round(performance.now() - t0) + 'ms');
      return;
    }

    // 猫 / 狗：蓄力 → 散成满屏粒子 → 汇聚
    if (!window.FX) throw new Error('NO_FX');
    ball.classList.add('charging');
    await wait(Math.round(280 / speed));
    ball.classList.add('vanishing');
    await wait(Math.round(180 / speed));
    ball.classList.add('hidden');
    ball.classList.remove('vanishing', 'charging');

    await window.FX.play({
      canvas,
      cx,
      cy,
      radius: BALL_SIZE * 0.42,
      chips: CHIP_DIRS,
      speed,
      onFrame: function (t, total) {
        if (t >= total * 0.94) triggerScreenFlash(320, 0.85);
      },
    });
    ball.classList.remove('hidden');
    ball.classList.add('reveal-in');
    await wait(Math.round(220 / speed));
    ball.classList.remove('reveal-in');
    window.logger.info('ball.anim', 'done ' + Math.round(performance.now() - t0) + 'ms');
  } catch (e) {
    window.logger.warn('ball.anim', 'failed: ' + e.message);
  } finally {
    ball.classList.remove('hidden', 'vanishing', 'drawing', 'charging', 'reveal-in', 'shaking', 'golden');
    ball.style.removeProperty('--as');
    closeOrbitNow();
    setBallTransform(c.x, c.y);
    ball.classList.add('idle');
  }
}

// ---------- 监听全局快捷键 / 托盘黄历测算 ----------
// 托盘/快捷键不播放全屏动画（用户选择「仅点击球体」）；设置里的预览会显式带 animate
window.api.onShortcutDraw((payload) => {
  if (payload && typeof payload === 'object') {
    runDrawFlow({ scope: payload.scope || 'today', animate: !!payload.animate });
  } else if (typeof payload === 'string' && payload) {
    runDrawFlow({ scope: payload });
  } else {
    runDrawFlow({ scope: 'today' });
  }
});

// OS 层点击穿透：见 setBallTransform 上方的 mouse tracking 区块。
// 球窗口默认 OS 层忽略鼠标（主进程启动时设置）；
// renderer 收到 forwarded mousemove 后判断光标是否在球上，动态切回 / 切走。

// ---------- 启动 ----------
ball.classList.add('idle');

// ---------- 桌面形象（猫 / 狗 / 财神 / 签筒） ----------
function applyPersona(name) {
  const valid = ['cat', 'dog', 'caishen', 'lots'];
  const next = valid.includes(name) ? name : 'cat';
  if (ballInner) ballInner.setAttribute('data-persona', next);
}

window.api.onPersonaChanged((name) => {
  applyPersona(name);
  window.logger.info('ball.persona', 'changed to ' + name);
});

(async () => {
  // 0. 应用桌面形象
  try { applyPersona(await window.api.getPersona()); } catch {}

  // 1. 读取保存的位置
  try {
    const saved = await window.api.getConfig('position');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      setBallTransform(saved.x, saved.y);
    } else {
      // 第一次启动：放右下角
      const screen = await window.api.getScreenInfo();
      if (screen) {
        const def = {
          x: screen.width  - BALL_SIZE - 40,
          y: screen.height - BALL_SIZE - 40,
        };
        setBallTransform(def.x, def.y);
        await window.api.savePosition(def.x, def.y);
      }
    }
    updateOrbitEdges();
  } catch (e) {
    console.warn('读取位置失败:', e);
    window.logger.warn('ball.init', `load failed: ${e.message}`);
  }

  // 1.5 摆位加持发生时弹气泡（方位停留满 5 分钟由主进程判定）
  try {
    window.api.onSpiritBoosted((info) => {
      if (!info || !info.dim) return;
      const bubble = document.getElementById('pet-bubble');
      if (!bubble) return;
      bubble.textContent = `✨ ${info.dim}加持 +${info.amount || 1}（${info.wuxing || ''}方位）`;
      bubble.classList.add('show');
      setTimeout(() => { if (bubble.isConnected) bubble.classList.remove('show'); }, 3500);
    });
  } catch {}

  // 1.6 连续看运天数：首次/断签后提示
  try {
    window.api.onStreakUpdated((info) => {
      if (!info || !info.streak) return;
      const bubble = document.getElementById('pet-bubble');
      if (!bubble) return;
      bubble.textContent = info.broke
        ? `🌱 重新开始 · 连续 ${info.streak} 天`
        : `🔥 连续看运 ${info.streak} 天`;
      bubble.classList.add('show');
      setTimeout(() => { if (bubble.isConnected) bubble.classList.remove('show'); }, 3500);
    });
  } catch {}

  // 2. 运势精灵方位提示（移到财位等方位可积累加持）
  try {
    const data = await window.api.getSpirit();
    const bubble = document.getElementById('pet-bubble');
    if (bubble && data.posDim) {
      const names = { 综合: '文昌位', 事业: '事业位', 财运: '财位', 爱情: '桃花位', 健康: '健康位' };
      bubble.textContent = `📍 当前在${names[data.posDim] || data.posDim}`;
      bubble.classList.add('show');
      // 启动较慢时先确认元素还在文档里，避免定时器操作已销毁的节点
      setTimeout(() => {
        if (bubble && bubble.isConnected) bubble.classList.remove('show');
      }, 4000);
    }
  } catch (e) {
    window.logger.warn('ball.init', `spirit status failed: ${e.message}`);
  }

  // 不再启动时自动应用今日运势——
  // 默认状态（粉色 + 微笑）保持，只有用户真正点击抽签时才更新
  // 这样用户每次启动看到的都是统一的初始外观
})();
