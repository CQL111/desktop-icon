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

function setBallTransform(x, y, extra = '') {
  posX = x;
  posY = y;
  ball.style.transform = `translate(${x}px, ${y}px)${extra}`;
  // 把当前位置同步给主进程（主进程用 screen.getCursorScreenPoint 决策 ignore-mouse）
  window.api.updateBallPos(x, y);
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
  ball.setPointerCapture(e.pointerId);
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
  }
  ball.classList.add('idle');
});

ball.addEventListener('pointercancel', () => {
  dragState = null;
  ball.classList.add('idle');
});

// ---------- 右键 → AI 运势对话 ----------
ball.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (isDrawing) return;
  window.logger.info('ball.contextmenu', 'openAiInput');
  window.api.openAiInput();
});

// ---------- 签圆点（球周围 4 个可选签） ----------
const signChips = document.querySelectorAll('.sign-chip');
signChips.forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation(); // 阻止冒泡到球的 pointerup（避免触发普通 handleClick）
    e.preventDefault();
    const scope = chip.getAttribute('data-scope');
    window.logger.info('ball.pickSign', `scope=${scope}`);
    handlePickSign(scope);
  });
  // chip 上不能启动拖拽
  chip.addEventListener('pointerdown', (e) => e.stopPropagation());
});

async function handlePickSign(scope) {
  if (isDrawing) return;
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
  await runDrawFlow({ scope: 'today' });
}

// 统一的抽签流程
async function runDrawFlow({ scope }) {
  if (isDrawing) return;
  isDrawing = true;
  ball.classList.remove('idle');

  // 记下原始位置（reset 用）
  originalBallPos = getCurrentPos();

  window.logger.info('ball.draw', `started scope=${scope}`);

  try {
    // 1. 先在主进程生成运势（不显示卡片，等数据就绪再显示）
    const result = await window.api.drawFortune({ deferCard: true, scope });
    if (!result) return;

    // 2. 应用运势（表情 + 颜色）
    applyFortune(result.fortune);

    // 3. 直接显示卡片（无弹跳/爆炸动画）
    const cur = getCurrentPos();
    await window.api.showFortuneCard(result.style, result.score, result.fortune, cur.x, cur.y);
    cardOpenTime = Date.now();
    window.logger.info('ball.draw', `done scope=${scope} style=${result.style} score=${result.score}`);
  } catch (e) {
    console.error('抽签失败:', e);
    window.logger.error('ball.draw', `failed scope=${scope}: ${e.message}`);
  } finally {
    isDrawing = false;
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

// ---------- 弹跳动画 ----------
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }

async function playBounceAnimation() {
  const screen = await window.api.getScreenInfo();
  if (!screen) return getCurrentPos();

  const startPos = getCurrentPos();
  // 让弹跳集中在屏幕中段（不贴边），适配不同屏幕尺寸
  const PAD = Math.round(Math.min(screen.width, screen.height) * 0.15);
  const corners = [
    { x: PAD,                              y: PAD },
    { x: screen.width  - BALL_SIZE - PAD,  y: PAD },
    { x: screen.width  - BALL_SIZE - PAD,  y: screen.height - BALL_SIZE - PAD },
    { x: PAD,                              y: screen.height - BALL_SIZE - PAD },
  ];
  const center = {
    x: Math.round((screen.width  - BALL_SIZE) / 2),
    y: Math.round((screen.height - BALL_SIZE) / 2),
  };

  const path = [startPos, ...corners, center];
  const SEG_MS = 240;
  const TOTAL_MS = SEG_MS * (path.length - 1);
  const SETTLE_MS = 220; // 抵达中心后停顿一下再爆

  return new Promise((resolve) => {
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const segF = elapsed / SEG_MS;
      const segIdx = Math.min(Math.floor(segF), path.length - 2);
      const localT = Math.min(1, segF - segIdx);
      // 奇数段用 easeOut（撞击角），偶数段用 easeIn（加速离开）
      const eased = (segIdx % 2 === 0) ? easeOutCubic(localT) : easeInCubic(localT);
      const start = path[segIdx];
      const end = path[segIdx + 1];
      const x = Math.round(start.x + (end.x - start.x) * eased);
      const y = Math.round(start.y + (end.y - start.y) * eased);
      const jitter = Math.sin(now / 35) * 6;
      setBallTransform(x, y, ` rotate(${jitter}deg)`);

      if (elapsed < TOTAL_MS) {
        requestAnimationFrame(tick);
      } else {
        // 抵达中心，去掉 jitter 让球稳一下
        setBallTransform(center.x, center.y);
        setTimeout(() => resolve(center), SETTLE_MS);
      }
    }
    requestAnimationFrame(tick);
  });
}

// ---------- 中心爆炸 ----------
function playExplodeEffect() {
  return new Promise((resolve) => {
    ball.classList.add('exploding');
    // 全屏白光亮一下
    const flash = document.getElementById('screen-flash');
    if (flash) {
      // 强制重启动画（连续抽签时同一元素要重新触发动画）
      flash.classList.remove('active');
      // 触发 reflow，让浏览器认为这个 class 是新加的
      void flash.offsetWidth;
      flash.classList.add('active');
    }
    setTimeout(() => {
      ball.classList.remove('exploding');
      if (flash) flash.classList.remove('active');
      resolve();
    }, 700);
  });
}

// ---------- 监听全局快捷键 / 托盘黄历测算 ----------
window.api.onShortcutDraw((scope) => {
  if (scope) {
    runDrawFlow({ scope });
  } else {
    handleClick();
  }
});

// OS 层点击穿透：见 setBallTransform 上方的 mouse tracking 区块。
// 球窗口默认 OS 层忽略鼠标（主进程启动时设置）；
// renderer 收到 forwarded mousemove 后判断光标是否在球上，动态切回 / 切走。

// ---------- 启动 ----------
ball.classList.add('idle');

(async () => {
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
  } catch (e) {
    console.warn('读取位置失败:', e);
    window.logger.warn('ball.init', `load failed: ${e.message}`);
  }

  // 2. 运势精灵方位提示（移到财位等方位可积累加持）
  try {
    const data = await window.api.getSpirit();
    const bubble = document.getElementById('pet-bubble');
    if (bubble && data.posDim) {
      const names = { 综合: '文昌位', 事业: '事业位', 财运: '财位', 爱情: '桃花位', 健康: '健康位' };
      bubble.textContent = `📍 当前在${names[data.posDim] || data.posDim}`;
      bubble.classList.add('show');
      setTimeout(() => bubble.classList.remove('show'), 4000);
    }
  } catch (e) {
    window.logger.warn('ball.init', `spirit status failed: ${e.message}`);
  }

  // 不再启动时自动应用今日运势——
  // 默认状态（粉色 + 微笑）保持，只有用户真正点击抽签时才更新
  // 这样用户每次启动看到的都是统一的初始外观
})();
