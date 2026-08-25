// fortuneSpirit.js - 运势精灵引擎
// 核心：运势五项维度的"加持器"，通过摆位 + 祈福积累加持值，测运势时叠加到分数

const DIMENSIONS = ['综合', '爱情', '事业', '财运', '健康'];

// 五行 → 维度（摆位方位 → 加持维度）
const WUXING_TO_DIM = {
  water: '综合',   // 左上 文昌/智慧位
  wood:  '事业',   // 右上 事业位
  metal: '财运',   // 左下 财位
  fire:  '爱情',   // 右下 桃花位
  earth: '健康',   // 中央 健康位
};

// 维度 → 五行（反向）
const DIM_TO_WUXING = {};
for (const [w, d] of Object.entries(WUXING_TO_DIM)) DIM_TO_WUXING[d] = w;

// 维度 → 运势风格里的字段名（traditional 用"爱情"，modern 用"感情"）
const DIM_FIELDS = {
  综合: ['score'],
  爱情: ['爱情', '感情'],
  事业: ['事业'],
  财运: ['财运'],
  健康: ['健康'],
};

const BOOST_MAX_BY_POSITION = 2;  // 摆位积累上限
const BOOST_MAX_TOTAL = 3;        // 祈福总上限
const BLESS_DAILY_LIMIT = 3;      // 每日祈福次数
const POSITION_ACCUM_MS = 5 * 60 * 1000; // 摆位 5 分钟 +1

function defaultSpirit() {
  return {
    boosts: { 综合: 0, 爱情: 0, 事业: 0, 财运: 0, 健康: 0 },
    lastBlessDate: '',
    blessCountToday: 0,
    positionWuxing: null,
    positionSince: 0,
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function getTodayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 摆位积累：球在方位停留足够久 → 对应维度 +1（上限 2）
function applyPosition(spirit, wuxing, now = Date.now()) {
  const dim = WUXING_TO_DIM[wuxing];
  if (!dim) {
    // 无效方位（中央土等），重置计时
    spirit.positionWuxing = null;
    spirit.positionSince = 0;
    return spirit;
  }
  if (spirit.positionWuxing !== wuxing) {
    // 球移动到了新方位，重新计时
    spirit.positionWuxing = wuxing;
    spirit.positionSince = now;
    return spirit;
  }
  // 同一方位，检查是否停留够久
  if (now - (spirit.positionSince || now) >= POSITION_ACCUM_MS) {
    if ((spirit.boosts[dim] || 0) < BOOST_MAX_BY_POSITION) {
      spirit.boosts[dim] = (spirit.boosts[dim] || 0) + 1;
      spirit.positionSince = now; // 重置，继续积累下一轮
    }
  }
  return spirit;
}

// 祈福：指定维度 +1（每日限次，总上限 3）
function bless(spirit, dim, dateKey, now = Date.now()) {
  if (!DIMENSIONS.includes(dim)) return { spirit, error: 'INVALID_DIM' };
  // 跨日重置计数
  if (spirit.lastBlessDate !== dateKey) {
    spirit.lastBlessDate = dateKey;
    spirit.blessCountToday = 0;
  }
  if (spirit.blessCountToday >= BLESS_DAILY_LIMIT) {
    return { spirit, error: 'DAILY_LIMIT' };
  }
  if ((spirit.boosts[dim] || 0) >= BOOST_MAX_TOTAL) {
    return { spirit, error: 'MAXED' };
  }
  spirit.boosts[dim] = (spirit.boosts[dim] || 0) + 1;
  spirit.blessCountToday++;
  return { spirit, error: null, dim, boost: spirit.boosts[dim], remaining: BLESS_DAILY_LIMIT - spirit.blessCountToday };
}

function getBoost(spirit, dim) {
  return spirit.boosts[dim] || 0;
}

module.exports = {
  DIMENSIONS,
  WUXING_TO_DIM,
  DIM_TO_WUXING,
  DIM_FIELDS,
  BOOST_MAX_BY_POSITION,
  BOOST_MAX_TOTAL,
  BLESS_DAILY_LIMIT,
  defaultSpirit,
  applyPosition,
  bless,
  getBoost,
  getTodayKey,
};