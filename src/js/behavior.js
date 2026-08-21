// behavior.js - 行为打分与风格选择
// 在主进程被 require：它只依赖传入的 behavior 对象

const STYLES = ['traditional', 'modern', 'lots', 'tarot', 'personalized'];
const HALF_LIFE_DAYS = 14;          // 14 天半衰期
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;
const DAY_MS = 86400000;
const COLD_START_SCORE = 1.0;       // 冷启动分数
const TEMPERATURE = 1.5;            // softmax 温度
const MIN_INTERACTIONS_FOR_PERSONALIZED = 10;

// 给定 style，返回时间衰减后的分数
function scoreStyle(style, behavior, now = Date.now()) {
  const rec = behavior[style];
  if (!rec) return COLD_START_SCORE;
  const ageDays = Math.max(0, (now - (rec.last_seen || 0)) / DAY_MS);
  const decay = Math.exp(-LAMBDA * ageDays);
  const raw = (rec.clicks || 0) * 1 + (rec.view_seconds || 0) * 0.01;
  // 行为太弱时（< 1）用冷启动分兜底，避免一直沉底
  const base = raw < 1 ? COLD_START_SCORE : raw;
  return base * decay;
}

// 给所有风格打分，返回 { style: score }
function scoreAll(behavior, now = Date.now()) {
  const out = {};
  for (const s of STYLES) out[s] = scoreStyle(s, behavior, now);
  return out;
}

// softmax 采样：返回被选中的 style
function softmaxSample(scores) {
  const entries = Object.entries(scores);
  // 减去最大值提升数值稳定性
  const max = Math.max(...entries.map(([, v]) => v));
  const exps = entries.map(([, v]) => Math.exp((v - max) / TEMPERATURE));
  const sum = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sum);
  let r = Math.random();
  for (let i = 0; i < entries.length; i++) {
    r -= probs[i];
    if (r <= 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}

// 综合接口：选风格
// 当总交互数 < MIN 时，强制均匀轮询（让用户发现所有风格）
function pickStyle(behavior, now = Date.now()) {
  const totalClicks = STYLES.reduce((sum, s) => sum + ((behavior[s] && behavior[s].clicks) || 0), 0);
  if (totalClicks < MIN_INTERACTIONS_FOR_PERSONALIZED) {
    // 均匀轮询：取 totalClicks 索引
    return STYLES[totalClicks % STYLES.length];
  }
  const scores = scoreAll(behavior, now);
  return softmaxSample(scores);
}

// 记录一次交互：调用方把 view_seconds 累加进来
function recordInteraction(behavior, style, durationSeconds = 0) {
  const cur = behavior[style] || { clicks: 0, view_seconds: 0, last_seen: 0 };
  cur.clicks = (cur.clicks || 0) + 1;
  cur.view_seconds = (cur.view_seconds || 0) + Math.max(0, Math.floor(durationSeconds));
  cur.last_seen = Date.now();
  behavior[style] = cur;
  return cur;
}

module.exports = {
  STYLES,
  scoreStyle,
  scoreAll,
  softmaxSample,
  pickStyle,
  recordInteraction,
};
