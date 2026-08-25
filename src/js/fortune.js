// fortune.js - 运势调度器（在主进程运行）
// 输入：风格 + 日期 + 上下文，输出：当日的运势数据

const yiji = require('./data/yiji');
const lots = require('./data/lots');
const tarot = require('./data/tarot');
const colors = require('./data/colors');
const quotes = require('./data/quotes');
const hourGuidance = require('./data/hourGuidance');
const persona = require('./data/persona');
const logger = require('./logger');

// ---------- 种子化随机数 ----------
// 让同一日同一风格产出稳定的内容（但不同日/不同风格不同）
function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seedKey) {
  return mulberry32(hashSeed(seedKey));
}

function pickN(rng, arr, n) {
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// 综合分（1-5）→ 表情 mood
function scoreToMood(score) {
  if (score >= 4) return 'happy';
  if (score <= 2) return 'sad';
  return 'neutral';
}

// 风格标签
const STYLE_LABELS = {
  traditional: '传统中式',
  modern: '现代简洁',
  lots: '趣味抽签',
  tarot: '星座塔罗',
  personalized: '个性推荐',
};

// ---------- 5 种风格生成器 ----------

function genTraditional(rng, ctx) {
  // 5 维评分：综合、爱情、事业、财运、健康（每维 1-5 星）
  const dims = {};
  for (const k of ['综合', '爱情', '事业', '财运', '健康']) {
    dims[k] = 1 + Math.floor(rng() * 5);
  }
  const overall = Math.round(
    (dims.综合 * 1.5 + dims.爱情 + dims.事业 + dims.财运 + dims.健康) / 5.5
  );
  const luckyNum = 1 + Math.floor(rng() * 9);
  const luckyColor = pick(rng, colors.lucky);
  const wuxingKey = pick(rng, Object.keys(colors.wuxing));
  const wuxingColor = colors.wuxing[wuxingKey];
  const yi = pickN(rng, yiji.yi, 3 + Math.floor(rng() * 2));
  const ji = pickN(rng, yiji.ji, 3 + Math.floor(rng() * 2));
  const shengxiao = pick(rng, ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']);
  return {
    style: 'traditional',
    styleLabel: STYLE_LABELS.traditional,
    score: overall,
    mood: scoreToMood(overall),
    date: ctx.dateKey,
    dims,
    luckyNum,
    luckyColor,
    wuxing: wuxingKey,
    wuxingColor,
    yi,
    ji,
    shengxiao,
  };
}

function genModern(rng, ctx) {
  const dims = {
    '感情': 30 + Math.floor(rng() * 70),
    '事业': 30 + Math.floor(rng() * 70),
    '财运': 30 + Math.floor(rng() * 70),
    '健康': 30 + Math.floor(rng() * 70),
  };
  const overall = Math.round(
    (dims.感情 + dims.事业 + dims.财运 + dims.健康) / 40 * 5
  ) / 1; // 0-5 星
  const score = Math.max(1, Math.min(5, Math.round(overall)));
  const summaries = {
    '感情': pick(rng, [
      '今天的状态不错，适合主动联系喜欢的人。',
      '感情上保持平常心，不要想太多。',
      '有可能收到告白或暧昧的信号。',
      '和伴侣的相处需要更多包容。',
      '单身的朋友今天魅力值较高。',
    ]),
    '事业': pick(rng, [
      '工作思路清晰，可以推进一些重要项目。',
      '会遇到一点小阻力，但不影响大局。',
      '同事关系和谐，适合协作型任务。',
      '注意细节，可能有疏漏的地方。',
      '领导今天对你印象较好。',
    ]),
    '财运': pick(rng, [
      '今天有偏财运，但不要冲动消费。',
      '收入稳定，开支也稳定。',
      '可能会有意外支出，注意控制。',
      '适合做长期理财规划。',
      '今天不适合借钱给别人。',
    ]),
    '健康': pick(rng, [
      '身体状态不错，多喝水多走动。',
      '注意休息，避免熬夜。',
      '适合做一些轻运动。',
      '情绪波动较大，建议冥想放松。',
      '胃口较好，注意饮食均衡。',
    ]),
  };
  return {
    style: 'modern',
    styleLabel: STYLE_LABELS.modern,
    score,
    mood: scoreToMood(score),
    date: ctx.dateKey,
    dims,
    summaries,
    luckyColor: pick(rng, colors.lucky),
  };
}

function genLots(rng, ctx) {
  // 从签筒随机抽一支
  const lot = pick(rng, lots);
  // level → 评分映射
  const levelScore = {
    '上上签': 5, '上签': 4, '中签': 3, '中下签': 2, '下签': 2,
  };
  const score = levelScore[lot.level] || 3;
  return {
    style: 'lots',
    styleLabel: STYLE_LABELS.lots,
    score,
    mood: scoreToMood(score),
    date: ctx.dateKey,
    level: lot.level,
    poem: lot.poem,
    interpretation: lot.interpretation,
    luckyColor: pick(rng, colors.lucky),
  };
}

function genTarot(rng, ctx) {
  // 用户星座：从 ctx.zodiac 拿；若没有，用当日日期对应星座
  let zodiac;
  if (ctx.zodiac) {
    zodiac = tarot.zodiacs.find(z => z.key === ctx.zodiac);
  }
  if (!zodiac) {
    logger.info('fortune.tarot', 'fallback to date zodiac');
    const d = new Date(ctx.dateKey);
    zodiac = tarot.getZodiac(d.getMonth() + 1, d.getDate());
  }
  const card = pick(rng, tarot.cards);
  const reversed = rng() < 0.5;
  const interpretations = {
    upright: `${card.keyword}的能量今日显现。`,
    reversed: `今日 ${card.keyword} 的反向能量更明显，需要反向思考。`,
  };
  // 评分
  const scoreMap = [4, 5, 3, 5, 4, 3, 5, 5, 4, 3, 4, 4, 2, 3, 4, 2, 2, 4, 3, 5, 4, 5];
  const baseScore = scoreMap[card.num] || 3;
  const score = reversed ? Math.max(1, baseScore - 1) : baseScore;
  return {
    style: 'tarot',
    styleLabel: STYLE_LABELS.tarot,
    score,
    mood: scoreToMood(score),
    date: ctx.dateKey,
    zodiac: zodiac.name,
    ruler: zodiac.ruler,
    element: zodiac.element,
    cardNum: card.num,
    cardName: card.name,
    cardEn: card.en,
    cardKeyword: card.keyword,
    reversed,
    interpretation: reversed ? interpretations.reversed : interpretations.upright,
    luckyColor: pick(rng, colors.lucky),
  };
}

function genPersonalized(rng, ctx) {
  // 个性化：综合其他 4 种风格的元素
  // 数据不足时退化到 modern
  const totalClicks = ctx.totalClicks || 0;
  if (totalClicks < 10) {
    logger.info('fortune.personalized', `degraded totalClicks=${totalClicks}`);
    return { ...genModern(rng, ctx), style: 'personalized', styleLabel: STYLE_LABELS.personalized };
  }
  // 选最常被点击的 2 个风格作为参考
  const topStyles = ctx.topStyles || ['modern', 'lots'];
  // 选一个主风格生成，再混入另一个风格的元素
  const primary = topStyles[0];
  const secondary = topStyles[1] || 'modern';
  let primaryData;
  if (primary === 'traditional') primaryData = genTraditional(rng, ctx);
  else if (primary === 'modern') primaryData = genModern(rng, ctx);
  else if (primary === 'lots') primaryData = genLots(rng, ctx);
  else if (primary === 'tarot') primaryData = genTarot(rng, ctx);
  else primaryData = genModern(rng, ctx);

  // 混入 secondary 的一句话
  let tagline = '';
  if (secondary === 'lots') {
    tagline = `今日小贴士：${pick(rng, lots).poem}`;
  } else if (secondary === 'tarot') {
    tagline = `今日塔罗指引：${pick(rng, tarot.cards).keyword}`;
  } else if (secondary === 'traditional') {
    tagline = `今日提醒：${pick(rng, yiji.yi)}`;
  } else {
    tagline = `今日金句：${pick(rng, [
      '保持节奏，不必着急。',
      '做自己喜欢的事最重要。',
      '今天也要善待自己。',
      '小步前进也是前进。',
    ])}`;
  }

  return {
    ...primaryData,
    style: 'personalized',
    styleLabel: STYLE_LABELS.personalized,
    tagline,
  };
}

// ---------- 主入口 ----------
function generate(style, ctx) {
  const dateKey = ctx.dateKey;
  const seedKey = `${style}|${dateKey}`;
  logger.info('fortune.generate', `style=${style} dateKey=${dateKey}`);
  const rng = makeRng(seedKey);
  switch (style) {
    case 'traditional': return genTraditional(rng, ctx);
    case 'modern':      return genModern(rng, ctx);
    case 'lots':        return genLots(rng, ctx);
    case 'tarot':       return genTarot(rng, ctx);
    case 'personalized':return genPersonalized(rng, ctx);
    default:            return genModern(rng, ctx);
  }
}

function getTodayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------- 时辰工具 ----------
// 把小时（0-23）映射到 12 时辰 key
const HOUR_TO_KEY = [
  '子', // 23-00
  '丑', // 00-02
  '丑',
  '寅', // 02-04
  '寅',
  '卯', // 04-06
  '卯',
  '辰', // 06-08
  '辰',
  '巳', // 08-10
  '巳',
  '午', // 10-12
  '午',
  '未', // 12-14
  '未',
  '申', // 14-16
  '申',
  '酉', // 16-18
  '酉',
  '戌', // 18-20
  '戌',
  '亥', // 20-22
  '亥',
  '子', // 22-23
];
function getCurrentHourKey(d = new Date()) {
  return HOUR_TO_KEY[d.getHours()];
}
function getHourInfo(hourKey) {
  return hourGuidance[hourKey] || hourGuidance['子'];
}

// ---------- ISO 周工具 ----------
function getIsoWeek(d = new Date()) {
  // 简化：返回 "YYYY-Www"
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ---------- 4 个新 scope 生成器 ----------

// scope=moment：此刻
function genHourFortune(ctx) {
  logger.info('fortune.moment', `hourKey=${ctx.hourKey || 'auto'}`);
  const hourKey = ctx.hourKey || getCurrentHourKey();
  const info = getHourInfo(hourKey);
  const seedKey = `${ctx.dateKey}|${hourKey}`;
  const rng = makeRng(seedKey);
  const luckyWord = pick(rng, quotes);
  const guidance = pick(rng, info.guidance);
  const yi = pickN(rng, yiji.yi, 1 + Math.floor(rng() * 2));
  const ji = pickN(rng, yiji.ji, 1 + Math.floor(rng() * 2));
  const luckyColor = pick(rng, colors.lucky);
  const score = 3 + Math.floor(rng() * 3); // 此刻给个偏正面分（3-5）

  // 融合个人（若已填生日 → 生肖/星座）
  let personal = null;
  const profile = ctx.profile;
  if (profile && profile.birthday) {
    const [py, pm, pd] = String(profile.birthday).split('-').map(Number);
    if (py && pm && pd) {
      personal = {
        shengxiao: persona.getShengxiao(py),
        zodiac: tarot.getZodiac(pm, pd).name,
      };
    }
  }

  return {
    style: 'moment',
    styleLabel: '此刻个人运势',
    score,
    mood: scoreToMood(score),
    date: ctx.dateKey,
    hour: hourKey,
    hourName: info.name,
    hourRange: info.range,
    hourIcon: info.icon,
    luckyWord,
    guidance,
    yi,
    ji,
    luckyColor,
    personal,   // { shengxiao, zodiac } | null
  };
}

// scope=tomorrow：明日（复用 modern 结构 + hint）
function genTomorrowFortune(ctx) {
  logger.info('fortune.tomorrow', `dateKey=${ctx.dateKey}`);
  const seedKey = `modern|${ctx.dateKey}`;
  const rng = makeRng(seedKey);
  const base = genModern(rng, ctx);
  const hints = [
    '明天宜早睡早起，节奏决定一切。',
    '明天的关键是把今天的小火苗延续下去。',
    '明天会是今天问题的清晰化，不急于当下解决。',
    '明天适合做铺垫，不适合收割。',
    '明天会给你一个温柔的提示，注意听。',
    '明天的你能比今天更从容。',
    '别为明天焦虑，今天睡好就够了。',
  ];
  return {
    ...base,
    style: 'tomorrow',
    styleLabel: '明日运势',
    tomorrowHint: pick(rng, hints),
  };
}

// scope=week：本周 7 天
function genWeekFortune(ctx) {
  logger.info('fortune.week', `dateKey=${ctx.dateKey}`);
  const rng = makeRng(`week|${ctx.dateKey}`);
  const today = new Date(ctx.dateKey);
  // 找到本周一
  const dow = today.getDay() || 7; // 周日=0 → 转成 7
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow - 1));
  const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const dayHints = [
    '平稳的一天，按部就班就好。',
    '会有小惊喜，注意细节。',
    '精力旺盛，适合攻坚。',
    '适合社交，会遇见有意思的人。',
    '宜专注工作，效率翻倍。',
    '能量低，给自己放个假。',
    '圆满收尾，心情舒展。',
  ];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const isToday = (d.getFullYear() === today.getFullYear() &&
                     d.getMonth() === today.getMonth() &&
                     d.getDate() === today.getDate());
    days.push({
      date: `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      weekday: weekdayNames[i],
      score: 2 + Math.floor(rng() * 4), // 2-5
      hint: pick(rng, dayHints),
      isToday,
    });
  }
  const avg = days.reduce((s, d) => s + d.score, 0) / 7;
  const weeklyHints = [
    '本周中段会迎来一波小高峰，提前布局。',
    '整体平稳，把精力放在周三和周五。',
    '适合开启一个长期项目，本周是好的起点。',
    '人际关系是本周的关键，多花时间沟通。',
    '本周宜学习新技能，会事半功倍。',
    '注意周末的休息，为下周蓄能。',
    '本周财运不错，适合做长期规划。',
  ];
  return {
    style: 'week',
    styleLabel: '本周运势',
    score: Math.round(avg),
    mood: scoreToMood(Math.round(avg)),
    date: ctx.dateKey,
    isoWeek: getIsoWeek(today),
    days,
    weeklyHint: pick(rng, weeklyHints),
  };
}

// ---------- 今日黄历 ----------
function genAlmanac(ctx) {
  const dateKey = ctx.dateKey;
  const [y] = String(dateKey).split('-').map(Number);
  const rng = makeRng(`almanac|${dateKey}`);
  const yearGanzhi = persona.getYearGanzhi(y);     // '甲辰'
  const shengxiao = persona.getShengxiao(y);        // '龙'
  const yi = pickN(rng, yiji.yi, 3);
  const ji = pickN(rng, yiji.ji, 3);
  const luckyColor = pick(rng, colors.lucky);
  const luckyNum = 1 + Math.floor(rng() * 9);
  return {
    style: 'almanac',
    styleLabel: '今日黄历',
    date: dateKey,
    yearGanzhi,
    shengxiao,
    yi,
    ji,
    luckyColor,
    luckyNum,
  };
}

// ---------- 个人测算 ----------
// 12 星座性格（用于 zodiac mode）
const ZODIAC_TRAITS = {
  '白羊座': '热情直率，行动力强，喜欢挑战，但偶尔急躁。',
  '金牛座': '沉稳务实，重视安全感，一旦认定就很有耐心。',
  '双子座': '思维敏捷，好奇心重，善沟通，但注意力易分散。',
  '巨蟹座': '顾家感性，直觉敏锐，重视情感连接。',
  '狮子座': '大方自信，有领导气质，渴望被认可。',
  '处女座': '细心追求完美，擅长分析，对自己要求高。',
  '天秤座': '优雅公正，重视和谐，善于权衡利弊。',
  '天蝎座': '专注深情，洞察力强，意志坚定。',
  '射手座': '热爱自由，乐观豁达，喜欢探索未知。',
  '摩羯座': '自律有野心，脚踏实地，懂得延迟满足。',
  '水瓶座': '创新独立，思想超前，重视个人空间。',
  '双鱼座': '浪漫共情，富有想象力，情感细腻。',
};

// 星座当日运势
const ZODIAC_LUCK = [
  '今日宜主动出击，机会稍纵即逝。',
  '适合静心规划，把节奏放慢一点。',
  '宜与人沟通，贵人可能藏在日常对话里。',
  '宜独处思考，想清楚再行动。',
  '今日精力充沛，适合推进重要事项。',
  '宜关注健康，早睡胜过一切补品。',
  '今日适合表达，把心里的话说出来。',
];

// 综合 mode 的性格标签（由 persona.getPersonalityTags 提供，这里补一条今日金句）
const COMPREHENSIVE_HINTS = [
  '顺势而为，但别忘倾听自己内心的声音。',
  '你的特质是一笔财富，今天把它用在正事上。',
  '守住自己的节奏，不必总和别人比较。',
  '今日宜把性格中的优势发挥到极致。',
];

function genProfile(ctx) {
  const profile = ctx.profile || {};
  const mode = ctx.profileMode || 'comprehensive';
  const birthday = profile.birthday;
  if (!birthday) throw new Error('NO_BIRTHDAY');
  const [y, m, d] = String(birthday).split('-').map(Number);
  if (!y || !m || !d) throw new Error('NO_BIRTHDAY');

  const rng = makeRng(`profile|${birthday}|${mode}`);

  const shengxiao = persona.getShengxiao(y);
  const zodiac = tarot.getZodiac(m, d);
  const tzInfo = persona.getTimeZoneOrientation();
  const luckyNum = 1 + Math.floor(rng() * 9);
  const luckyColor = pick(rng, colors.lucky);
  const genderLabel = profile.gender === 'female' ? '女' : (profile.gender === 'male' ? '男' : '保密');

  const base = {
    style: 'profile',
    styleLabel: '今日个人运势',
    date: ctx.dateKey,
    birthday: String(birthday),
    gender: genderLabel,
    shengxiao,
    zodiac: zodiac.name,
    ruler: zodiac.ruler,
    element: zodiac.element,
    tzOrientation: tzInfo.orientation,
    tzWuxing: tzInfo.wuxing,
    tzNote: tzInfo.note,
    luckyNum,
    luckyColor,
    almanac: genAlmanac(ctx),   // 融合今日黄历
    mode,
  };

  if (mode === 'bazi') {
    const yearGanZhi = persona.getYearGanzhi(y);
    const monthZhi = persona.getMonthZhi(m);
    const wuxingDist = persona.getWuxingDistribution(
      [persona.TIAN_GAN.indexOf(yearGanZhi[0])],
      [persona.DI_ZHI.indexOf(yearGanZhi[1]), persona.DI_ZHI.indexOf(monthZhi)]
    );
    // 转成中文 key 输出
    const distLabel = {};
    for (const [k, v] of Object.entries(wuxingDist)) {
      distLabel[colors.wuxing[k] ? colors.wuxing[k].element : k] = v;
    }
    const dominantKey = Object.entries(wuxingDist).sort((a, b) => b[1] - a[1])[0][0];
    const dominantLabel = colors.wuxing[dominantKey] ? colors.wuxing[dominantKey].element : dominantKey;
    return {
      ...base,
      modeLabel: '八字排盘',
      yearGanZhi,
      monthZhi,
      wuxingDist: distLabel,
      dominantWuxing: dominantKey,
      dominantLabel,
      score: Math.max(1, Math.min(5, 3 + (wuxingDist[dominantKey] || 0))),
    };
  }

  if (mode === 'zodiac') {
    return {
      ...base,
      modeLabel: '星座性格',
      zodiacTraits: ZODIAC_TRAITS[zodiac.name] || '',
      zodiacLuck: pick(rng, ZODIAC_LUCK),
      score: 3 + Math.floor(rng() * 3),
    };
  }

  // comprehensive（默认）
  const personalityTags = persona.getPersonalityTags(shengxiao, zodiac.name, profile.gender);
  return {
    ...base,
    modeLabel: '综合命理档案',
    personalityTags,
    comprehensiveHint: pick(rng, COMPREHENSIVE_HINTS),
    score: 4,
  };
}

module.exports = {
  generate,
  getTodayKey,
  getCurrentHourKey,
  getHourInfo,
  getIsoWeek,
  genHourFortune,
  genTomorrowFortune,
  genWeekFortune,
  genProfile,
  genAlmanac,
  STYLE_LABELS,
};
