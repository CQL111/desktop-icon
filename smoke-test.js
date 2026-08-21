// smoke-test.js - 核心模块单元烟雾测试
const behavior = require('./src/js/behavior');
const fortune = require('./src/js/fortune');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.log('  ✗', msg); }
}

// === behavior.js ===
console.log('\n[behavior.js]');
assert(behavior.STYLES.length === 5, 'STYLES 有 5 个');
assert(behavior.STYLES.includes('traditional'), '包含 traditional');
assert(behavior.STYLES.includes('modern'), '包含 modern');
assert(behavior.STYLES.includes('lots'), '包含 lots');
assert(behavior.STYLES.includes('tarot'), '包含 tarot');
assert(behavior.STYLES.includes('personalized'), '包含 personalized');

// 冷启动应该均匀轮询
const empty = {};
for (let i = 0; i < 5; i++) {
  const picked = behavior.pickStyle(empty);
  assert(behavior.STYLES.includes(picked), `轮询第 ${i} 次返回 ${picked}`);
}

// 模拟用户反复点击 lots
const b1 = {};
for (let i = 0; i < 20; i++) behavior.recordInteraction(b1, 'lots', 30);
const scores = behavior.scoreAll(b1, Date.now());
assert(scores.lots > scores.modern, `lots 分数 (${scores.lots.toFixed(2)}) 应高于 modern (${scores.modern.toFixed(2)})`);

// softmax 应该偏向 lots
const chosenStyle = behavior.pickStyle(b1);
assert(chosenStyle === 'lots', `行为指向时 pickStyle 应选 lots，实际: ${chosenStyle}`);

// 时间衰减
const oldDate = Date.now() - 30 * 86400000; // 30 天前
const b2 = { lots: { clicks: 10, view_seconds: 100, last_seen: oldDate } };
const decayed = behavior.scoreStyle('lots', b2, Date.now());
const fresh = behavior.scoreStyle('lots', { lots: { clicks: 10, view_seconds: 100, last_seen: Date.now() } });
assert(decayed < fresh, `30 天前的分数 (${decayed.toFixed(3)}) 应低于新鲜的 (${fresh.toFixed(3)})`);

// === fortune.js ===
console.log('\n[fortune.js]');
assert(typeof fortune.getTodayKey === 'function', 'getTodayKey 是函数');
const todayKey = fortune.getTodayKey();
assert(/^\d{4}-\d{2}-\d{2}$/.test(todayKey), `todayKey 格式正确: ${todayKey}`);

// 5 种风格都能生成
for (const style of behavior.STYLES) {
  const data = fortune.generate(style, { dateKey: todayKey, zodiac: 'scorpio' });
  assert(data.style === style, `${style}: 风格标记正确`);
  assert(typeof data.score === 'number' && data.score >= 1 && data.score <= 5, `${style}: score 在 1-5 (${data.score})`);
  assert(['happy', 'neutral', 'sad'].includes(data.mood), `${style}: mood 合法 (${data.mood})`);
  assert(data.date === todayKey, `${style}: 日期正确`);
}

// 同日同风格 → 同结果（seeded）
const d1 = fortune.generate('traditional', { dateKey: '2026-08-20', zodiac: null });
const d2 = fortune.generate('traditional', { dateKey: '2026-08-20', zodiac: null });
assert(JSON.stringify(d1) === JSON.stringify(d2), '同日同风格结果稳定');

// 不同日 → 不同结果
const d3 = fortune.generate('modern', { dateKey: '2026-08-20', zodiac: null });
const d4 = fortune.generate('modern', { dateKey: '2026-08-21', zodiac: null });
assert(JSON.stringify(d3) !== JSON.stringify(d4), '不同日结果不同');

// 各风格特定字段
const trad = fortune.generate('traditional', { dateKey: todayKey, zodiac: null });
assert(trad.dims && trad.dims.综合, 'traditional 有 dims.综合');
assert(trad.luckyNum >= 1 && trad.luckyNum <= 9, 'traditional luckyNum 1-9');
assert(Array.isArray(trad.yi) && trad.yi.length > 0, 'traditional 有 yi 列表');
assert(Array.isArray(trad.ji) && trad.ji.length > 0, 'traditional 有 ji 列表');
assert(trad.luckyColor && /^#[0-9a-f]{6}$/i.test(trad.luckyColor.hex), 'traditional 有 luckyColor.hex');

const modern = fortune.generate('modern', { dateKey: todayKey, zodiac: null });
assert(modern.dims.感情 >= 30 && modern.dims.感情 <= 100, 'modern 感情分 30-100');
assert(modern.summaries && modern.summaries.感情, 'modern 有 summaries.感情');
assert(modern.luckyColor && /^#[0-9a-f]{6}$/i.test(modern.luckyColor.hex), 'modern 有 luckyColor.hex');

const lot = fortune.generate('lots', { dateKey: todayKey, zodiac: null });
assert(['上上签','上签','中签','中下签','下签'].includes(lot.level), `lots level 合法 (${lot.level})`);
assert(lot.poem && lot.interpretation, 'lots 有签文和解签');
assert(lot.luckyColor && /^#[0-9a-f]{6}$/i.test(lot.luckyColor.hex), 'lots 有 luckyColor.hex');

const taro = fortune.generate('tarot', { dateKey: todayKey, zodiac: null });
assert(taro.cardName, `tarot cardName: ${taro.cardName}`);
assert(typeof taro.reversed === 'boolean', 'tarot reversed 是布尔');
assert(taro.zodiac, `tarot zodiac: ${taro.zodiac}`);
assert(taro.luckyColor && /^#[0-9a-f]{6}$/i.test(taro.luckyColor.hex), 'tarot 有 luckyColor.hex');

// 个性化在交互不足时退化到 modern
const persCold = fortune.generate('personalized', { dateKey: todayKey, zodiac: null, totalClicks: 3 });
assert(persCold.style === 'personalized', 'personalized cold-start style 标记为 personalized');

// 个性化在交互充足时保留 tagline
const persHot = fortune.generate('personalized', { dateKey: todayKey, zodiac: null, totalClicks: 20, topStyles: ['lots', 'modern'] });
assert(persHot.tagline, 'personalized hot 有 tagline');

// ===== 第三阶段：3 个新 scope 生成器 =====

// 此刻 (moment)
const momentF = fortune.genHourFortune({ dateKey: todayKey, hourKey: '申' });
assert(momentF.style === 'moment', 'moment style 正确');
assert(momentF.styleLabel === '此刻运势', 'moment styleLabel 正确');
assert(momentF.hour === '申', 'moment hour 正确');
assert(typeof momentF.luckyWord === 'string' && momentF.luckyWord.length > 0, 'moment luckyWord 存在');
assert(typeof momentF.guidance === 'string' && momentF.guidance.length > 0, 'moment guidance 存在');
assert(Array.isArray(momentF.yi) && momentF.yi.length >= 1, 'moment yi 数组');
assert(Array.isArray(momentF.ji) && momentF.ji.length >= 1, 'moment ji 数组');
assert(momentF.luckyColor && momentF.luckyColor.hex, 'moment luckyColor.hex 存在');
assert(momentF.score >= 1 && momentF.score <= 5, 'moment score 1-5');

// 不同时辰 → 不同内容
const momentF2 = fortune.genHourFortune({ dateKey: todayKey, hourKey: '子' });
assert(momentF.luckyWord !== momentF2.luckyWord || momentF.guidance !== momentF2.guidance, '不同时辰产出不同');

// 明日 (tomorrow)
const tomorrowF = fortune.genTomorrowFortune({ dateKey: '2026-08-22' });
assert(tomorrowF.style === 'tomorrow', 'tomorrow style 正确');
assert(tomorrowF.styleLabel === '明日运势', 'tomorrow styleLabel 正确');
assert(tomorrowF.date === '2026-08-22', 'tomorrow dateKey 正确');
assert(tomorrowF.dims && tomorrowF.dims.感情 !== undefined, 'tomorrow dims.感情 存在');
assert(typeof tomorrowF.tomorrowHint === 'string', 'tomorrow hint 存在');
assert(tomorrowF.luckyColor && tomorrowF.luckyColor.hex, 'tomorrow luckyColor.hex 存在');

// 本周 (week)
const weekF = fortune.genWeekFortune({ dateKey: todayKey });
assert(weekF.style === 'week', 'week style 正确');
assert(weekF.styleLabel === '本周运势', 'week styleLabel 正确');
assert(Array.isArray(weekF.days) && weekF.days.length === 7, 'week days 长度=7');
assert(weekF.days[0].weekday === '周一' && weekF.days[6].weekday === '周日', 'week 周一-周日顺序');
const todayEntry = weekF.days.find((d) => d.isToday);
assert(todayEntry, 'week 标记了今天');
assert(typeof weekF.weeklyHint === 'string', 'week weeklyHint 存在');
assert(weekF.isoWeek && /^[\d-]+-W\d+$/.test(weekF.isoWeek), 'week isoWeek 格式');

// 工具
assert(typeof fortune.getCurrentHourKey() === 'string', 'getCurrentHourKey 返回字符串');
assert(typeof fortune.getIsoWeek(new Date()) === 'string', 'getIsoWeek 返回字符串');
const hourInfo = fortune.getHourInfo('申');
assert(hourInfo && hourInfo.name === '申时', 'getHourInfo 申时正确');

console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
