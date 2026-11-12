// fx.js - 抽签全屏特效（参考 Aceternity UI / Cult UI / HeroUI 的动效思路）
// 渲染分层（全部在 canvas #fx 里，透明窗口 + 点击穿透不受影响）：
//   A. 聚运场：径向暗场 + 呼吸光晕（HeroUI Progressive Blur 的柔和过渡）
//   B. 星盘：缓慢旋转的双层发光圆环 + 弧线刻度
//   C. 粒子星云：自由漂浮（Sparkles）
//   D. 四签粒子：从球体四签位置外溢再回流（Aceternity orbiting / Border Beam 预告）
//   E. 流星：从屏幕边缘射向球心（Meteors）
//   F. 汇聚：粒子螺旋吸附到球心 + 球周围星屑环绕（Sparkles 收束）
// 只依赖 Canvas 2D，不引入任何 npm 依赖；rAF 时间戳 clamp + 超时兜底，
// 任何异常都会复位，不会把抽签流程锁死。
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const BRAND = {
    rose: '#ff8aa3',
    roseSoft: '#f9a8d4',
    peach: '#ffd6e0',
    gold: '#fcd34d',
    white: '#ffffff',
  };

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - clamp01(t), 3); }
  function easeOutExpo(t) { const c = clamp01(t); return c >= 1 ? 1 : 1 - Math.pow(2, -10 * c); }
  function easeInOutCubic(t) { const c = clamp01(t); return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2; }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // 每隔多少毫秒生成一次流星（越接近汇聚越多）
  function meteorRate(t, total, convergeStart) {
    if (t < convergeStart) return 70;
    const k = clamp01((t - convergeStart) / (total - convergeStart));
    return 70 - k * 46;
  }

  // 小圆点（带辉光）—— 比逐帧建 radialGradient 便宜得多
  function dot(ctx, x, y, r, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  function glow(ctx, x, y, r, inner, outer) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /**
   * 播放一次抽签特效。
   * @param {Object} o
   * @param {HTMLCanvasElement} o.canvas
   * @param {number} o.cx       球心 x（屏幕坐标）
   * @param {number} o.cy       球心 y
   * @param {number} o.radius   球半径
   * @param {Array}  o.chips    四签相对球心的方向（{dx, dy}），用于"四签粒子"
   * @param {number} [o.speed]  速度倍率（1 = 默认时长）
   * @param {(t:number,total:number)=>void} [o.onFrame] 每帧回调（t 毫秒）
   * @returns {Promise<void>}
   */
  function play(o) {
    const cfg = o || {};
    const canvas = cfg.canvas;
    const cx = cfg.cx || 0;
    const cy = cfg.cy || 0;
    const R0 = cfg.radius || 40;
    const speed = Math.max(0.4, cfg.speed || 1);
    const chips = Array.isArray(cfg.chips) && cfg.chips.length
      ? cfg.chips
      : [{ dx: 0, dy: -R0 }, { dx: R0, dy: 0 }, { dx: 0, dy: R0 }, { dx: -R0, dy: 0 }];
    const totalMs = 2800 / speed;

    if (!canvas || !canvas.getContext) return Promise.resolve();

    const W = window.innerWidth;
    const H = window.innerHeight;
    // 4K 屏上把画布像素和粒子数量压下来，保证 60fps（动画时长才不会被拉长）
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.classList.add('active');

    // ---------- 阶段时间（各阶段按总时长占比，加起来正好等于 totalMs） ----------
    const EMIT = 0.12 * totalMs;          // 球 → 粒子（四签外溢）
    const BURST = 0.30 * totalMs;         // 粒子炸开铺满
    const ORBIT = 0.25 * totalMs;         // 星云自由漂浮
    const CONVERGE = 0.27 * totalMs;      // 螺旋吸附回球心
    const FLASH = 0.06 * totalMs;         // 收束白闪
    const tEmit = EMIT;
    const tBurst = tEmit + BURST;
    const tConverge = tBurst + ORBIT;
    const tFlash = tConverge + CONVERGE;
    const T = tFlash + FLASH;

    // ---------- 粒子 ----------
    const count = W * H > 2500000 ? 200 : 260;
    const rMax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const parts = [];
    for (let i = 0; i < count; i++) {
      const isChip = i < chips.length * 10;
      const theta = Math.random() * TAU;
      const dist = Math.pow(Math.random(), 0.8) * rMax * 0.92;
      const chip = chips[i % chips.length];
      parts.push({
        // 起点：从球心附近出发，四签粒子从对应签位溢出
        sx: cx + (isChip ? chip.dx * rand(0.6, 1.6) : Math.cos(theta) * R0 * rand(0.2, 0.9)),
        sy: cy + (isChip ? chip.dy * rand(0.6, 1.6) : Math.sin(theta) * R0 * rand(0.2, 0.9)),
        // 爆开目标点
        tx: cx + Math.cos(theta) * dist,
        ty: cy + Math.sin(theta) * dist * 0.94,
        size: isChip ? rand(2.2, 4.2) : rand(1.2, 3.4),
        color: isChip
          ? pick([BRAND.rose, BRAND.roseSoft, BRAND.gold])
          : pick([BRAND.roseSoft, BRAND.rose, BRAND.gold, BRAND.peach, BRAND.white]),
        delay: rand(0, isChip ? 0.10 : 0.25),
        phase: rand(0, TAU),
        spin: rand(3.2, 6.8) * (Math.random() > 0.5 ? 1 : -1),
        drift: rand(-14, 14),
        trail: isChip ? rand(8, 18) : rand(3, 10),
        x: cx,
        y: cy,
      });
    }

    // ---------- 流星 ----------
    const meteors = [];
    let meteorTimer = 0;

    // ---------- 星屑（汇聚时绕球飞过） ----------
    const sparkles = [];
    for (let i = 0; i < 26; i++) {
      sparkles.push({
        angle: rand(0, TAU),
        omega: rand(1.6, 3.6) * (Math.random() > 0.5 ? 1 : -1),
        r0: rand(R0 * 1.5, R0 * 4.8),
        rv: rand(-40, -12),
        size: rand(0.8, 2.2),
        color: pick([BRAND.white, BRAND.gold, BRAND.roseSoft]),
        twinkle: rand(0.0015, 0.004),
        phase: rand(0, TAU),
      });
    }

    let raf = 0;
    let guard = 0;
    let fallbackTimer = 0;
    let start = 0;

    function meteorSpawn(t, now) {
      const rate = meteorRate(t, T, tConverge);
      if (now - meteorTimer < rate) return;
      meteorTimer = now;
      const edge = (Math.random() * 4) | 0;
      let x, y;
      if (edge === 0) { x = rand(-100, W + 100); y = -60; }
      else if (edge === 1) { x = W + 60; y = rand(-60, H * 0.7); }
      else if (edge === 2) { x = rand(-100, W + 100); y = -80; }
      else { x = -60; y = rand(-60, H * 0.7); }
      const dx = cx - x;
      const dy = cy - y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = rand(900, 1500);
      meteors.push({
        x, y,
        vx: (dx / len) * sp,
        vy: (dy / len) * sp,
        life: 0,
        max: rand(0.55, 1.1),
        color: Math.random() > 0.35 ? BRAND.gold : BRAND.white,
        width: rand(0.8, 1.8),
      });
    }

    function updateMeteors(dt) {
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life += dt;
        if (m.life > m.max || m.x < -160 || m.x > W + 160 || m.y > H + 160) meteors.splice(i, 1);
      }
    }

    function drawMeteors() {
      for (const m of meteors) {
        const a = clamp01(m.life / m.max);
        const tail = 0.16;
        const tx = m.x - m.vx * tail;
        const ty = m.y - m.vy * tail;
        const g = ctx.createLinearGradient(tx, ty, m.x, m.y);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.6, m.color);
        g.addColorStop(1, m.color);
        ctx.globalAlpha = (1 - a) * 0.9;
        ctx.strokeStyle = g;
        ctx.lineWidth = m.width;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        // 流星头
        dot(ctx, m.x, m.y, m.width * 1.8, BRAND.white, (1 - a) * 0.95);
      }
    }

    function drawBackdrop(t) {
      // A. 聚运场：整屏幕轻微压暗 + 以球心为中心的柔光，结束时淡出
      const appear = clamp01((t - EMIT) / (tBurst - EMIT));
      const fade = 1 - clamp01((t - tConverge) / (tFlash - tConverge + CONVERGE * 0.5));
      const strength = easeInOutSine(appear) * fade;
      if (strength > 0.001) {
        // 全屏暗角：保证在白色/浅色桌面上粒子也清晰可见（之前太淡，浅色桌面几乎看不见）
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(20,12,28,' + (0.22 * strength).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
        const breathe = 1 + 0.04 * Math.sin(t * 0.0024);
        const glowR = Math.max(W, H) * 0.62 * breathe;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        g.addColorStop(0, 'rgba(255,244,248,' + (0.10 * strength).toFixed(3) + ')');
        g.addColorStop(0.35, 'rgba(255,138,163,' + (0.06 * strength).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,138,163,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      // B. 星盘：双层发光圆环 + 刻度弧（尺寸随屏幕放大）
      const ringIn = easeInOutCubic(clamp01((t - EMIT) / (tBurst - EMIT)));
      const ringOut = 1 - clamp01((t - tConverge) / (tFlash - tConverge));
      const ringA = ringIn * ringOut;
      if (ringA > 0.01) {
        const base = Math.min(W, H);
        const rot = t * 0.00042;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.arc(0, 0, base * 0.30 + 24 * Math.sin(t * 0.0018), 0, TAU);
        ctx.strokeStyle = 'rgba(252,211,77,' + (0.32 * ringA).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = BRAND.gold;
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, base * 0.22 + 18 * Math.sin(t * 0.0021 + 1), 0, TAU);
        ctx.strokeStyle = 'rgba(255,138,163,' + (0.30 * ringA).toFixed(3) + ')';
        ctx.shadowColor = BRAND.roseSoft;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 刻度弧（4 段，随四签方向）
        for (let i = 0; i < 4; i++) {
          const a0 = i * (TAU / 4) + rot * 0.6;
          ctx.beginPath();
          ctx.arc(0, 0, base * 0.35, a0, a0 + 0.2);
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.24 * ringA).toFixed(3) + ')';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function particlePos(p, t) {
      const lt = Math.max(0, t - p.delay * 1000);
      if (t < tBurst) {
        // C→D. 从四签 / 球体溢出并炸开，带少量拖尾
        const k = easeOutExpo(lt / (tBurst - EMIT));
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        p.dotAlpha = clamp01(lt / 240);
      } else if (t < tConverge) {
        // E. 星云漂浮：在爆开点附近缓慢游走
        const f = (t - tBurst) / ORBIT;
        p.x = p.tx + Math.cos(p.phase + f * 2.2) * 10 + p.drift * f;
        p.y = p.ty + Math.sin(p.phase + f * 2.6) * 10 + p.drift * 0.4 * f;
        p.dotAlpha = 0.72 + 0.28 * Math.sin(p.phase + t * 0.004);
      } else if (t < tFlash) {
        // F. 螺旋吸附：越靠近球心越亮
        const e = easeInOutCubic(clamp01((t - tConverge) / CONVERGE));
        const ang = p.spin * e;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);
        const dx = p.tx - cx;
        const dy = p.ty - cy;
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        p.x = cx + rx * (1 - e);
        p.y = cy + ry * (1 - e);
        p.dotAlpha = 0.9 + 0.1 * Math.sin(p.phase + t * 0.01);
      } else {
        p.x = cx;
        p.y = cy;
        p.dotAlpha = 1;
      }
    }

    function drawParticles(t) {
      const converging = t >= tConverge;
      for (const p of parts) {
        particlePos(p, t);
        const near = Math.hypot(p.x - cx, p.y - cy);
        const alpha = p.dotAlpha * (converging ? 0.55 + 0.45 * clamp01(1 - near / 220) : 1);
        if (alpha <= 0.01) continue;

        // 拖尾：沿运动方向拉一条短线（纯色 + 低透明度，避免每帧为每颗粒子建渐变）
        if (!converging && p.trail > 4) {
          const dx = p.x - p.sx;
          const dy = p.y - p.sy;
          const d = Math.hypot(dx, dy) || 1;
          const tx = p.x - (dx / d) * p.trail;
          const ty = p.y - (dy / d) * p.trail;
          ctx.globalAlpha = alpha * 0.28;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }

        // 辉光 + 实心（只给较大的粒子加高光，减少绘制次数）
        ctx.globalAlpha = alpha * 0.28;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.4, 0, TAU);
        ctx.fill();
        dot(ctx, p.x, p.y, p.size, p.color, alpha);
        if (p.size > 2.2) dot(ctx, p.x - p.size * 0.25, p.y - p.size * 0.25, p.size * 0.32, BRAND.white, alpha * 0.85);
      }
    }

    function drawSparkles(t) {
      const k = clamp01((t - (tConverge - ORBIT * 0.35)) / (tFlash - (tConverge - ORBIT * 0.35)));
      if (k <= 0) return;
      const glowK = Math.sin(Math.PI * clamp01(k * 1.15));
      glow(ctx, cx, cy, R0 * 3.2, 'rgba(255,244,248,' + (0.28 * glowK).toFixed(3) + ')', 'rgba(255,244,248,0)');
      const tSec = t / 1000;
      for (const s of sparkles) {
        const ang = s.angle + s.omega * tSec;
        const r = Math.max(R0 * 0.9, s.r0 + s.rv * tSec);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        const a = glowK * (0.55 + 0.45 * Math.sin(s.phase + t * s.twinkle));
        dot(ctx, x, y, s.size, s.color, a);
        if (s.size > 1.6) {
          // 十字星芒（Aceternity Sparkles 的 star 形状）
          ctx.globalAlpha = a * 0.8;
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x - s.size * 2.2, y);
          ctx.lineTo(x + s.size * 2.2, y);
          ctx.moveTo(x, y - s.size * 2.2);
          ctx.lineTo(x, y + s.size * 2.2);
          ctx.stroke();
        }
      }
    }

    function drawCore(t) {
      if (t < tConverge) return;
      const k = easeInOutCubic(clamp01((t - tConverge) / (tFlash - tConverge)));
      const pulse = 1 + 0.08 * Math.sin(t * 0.02);
      glow(ctx, cx, cy, (R0 * (1.1 + 2.2 * k)) * pulse,
        'rgba(255,244,248,' + (0.75 * k).toFixed(3) + ')',
        'rgba(255,244,248,0)');
      ctx.globalAlpha = 0.9 * k;
      ctx.fillStyle = '#fff4f8';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, R0 * 0.22 * k), 0, TAU);
      ctx.fill();
    }

    let finished = false;
    let resolveDone = null;
    const done = new Promise(function (res) { resolveDone = res; });
    let lastTick = 0;
    let prev = 0;

    function frame(now) {
      if (finished) return;
      if (now - lastTick < 8) return; // 同一帧内 rAF 和定时器都触发时只画一次
      lastTick = now;
      if (!start) start = now;
      const t = Math.max(0, now - start);
      const dt = Math.min(0.05, prev ? (now - prev) / 1000 : 0.016);
      prev = now;
      ctx.clearRect(0, 0, W, H);
      drawBackdrop(t);
      meteorSpawn(t, now);
      updateMeteors(dt);
      drawMeteors();
      drawParticles(t);
      drawSparkles(t);
      drawCore(t);
      if (typeof cfg.onFrame === 'function') {
        try { cfg.onFrame(t, T); } catch (_) { /* 不影响渲染 */ }
      }
      if (t >= T) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function cleanup() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = 0; }
      if (guard) { clearTimeout(guard); guard = 0; }
      canvas.classList.remove('active');
      ctx.clearRect(0, 0, W, H);
    }

    function finish() {
      if (finished) return;
      finished = true;
      cleanup();
      if (resolveDone) resolveDone();
    }

    // 双驱动：rAF 负责流畅帧；窗口被遮挡 / 失焦时 Chromium 会节流 rAF，
    // 这时用定时器按时间推进，保证动画不会停在半路（也不会把点击锁死）
    raf = requestAnimationFrame(frame);
    fallbackTimer = setInterval(function () {
      if (finished) return;
      const now = performance.now();
      if (now - lastTick > 50) frame(now);
    }, 33);
    guard = setTimeout(finish, T + 800);

    return done;
  }

  window.FX = { play, BRAND };
})();
