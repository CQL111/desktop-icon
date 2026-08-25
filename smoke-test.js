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
assert(momentF.styleLabel === '此刻个人运势', 'moment styleLabel 正确');
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

// ===== 第六阶段：个人测算 =====
const persona = require('./src/js/data/persona');
assert(persona.getShengxiao(1995) === '猪', 'persona 1995=猪');
assert(persona.getShengxiao(2008) === '鼠', 'persona 2008=鼠');
assert(persona.getYearGanzhi(1984) === '甲子', 'persona 1984=甲子');
assert(persona.getMonthZhi(7) === '未', 'persona 7月=未');
const tzInfo = persona.getTimeZoneOrientation();
assert(tzInfo && tzInfo.orientation, 'persona 时区方位存在');

const profile = { birthday: '1995-07-20', gender: 'female' };
const profComp = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'comprehensive' });
assert(profComp.style === 'profile', 'profile comprehensive style');
assert(profComp.mode === 'comprehensive', 'profile comprehensive mode');
assert(profComp.shengxiao === '猪', 'profile 生肖');
assert(profComp.zodiac === '巨蟹座', 'profile 星座 1995-07-20=巨蟹');
assert(Array.isArray(profComp.personalityTags) && profComp.personalityTags.length > 0, 'profile 性格标签');
assert(profComp.luckyColor && profComp.luckyColor.hex, 'profile 幸运色');

const profBazi = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'bazi' });
assert(profBazi.mode === 'bazi', 'profile bazi mode');
assert(profBazi.yearGanZhi === '乙亥', 'profile 年柱 1995=乙亥');
assert(profBazi.monthZhi === '未', 'profile 月支 7月=未');
assert(profBazi.wuxingDist && Object.keys(profBazi.wuxingDist).length === 5, 'profile 五行分布 5 行');
assert(profBazi.dominantLabel, 'profile 主属性');

const profZodiac = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'zodiac' });
assert(profZodiac.mode === 'zodiac', 'profile zodiac mode');
assert(profZodiac.zodiacTraits && profZodiac.zodiacTraits.length > 0, 'profile 星座性格');

// NO_BIRTHDAY
let threw = false;
try { fortune.genProfile({ dateKey: todayKey, profile: {}, profileMode: 'comprehensive' }); }
catch (e) { threw = e.message === 'NO_BIRTHDAY'; }
assert(threw, 'profile 无生日抛 NO_BIRTHDAY');

// ===== 第六阶段：今日黄历 =====
const almanac = fortune.genAlmanac({ dateKey: '2026-08-24' });
assert(almanac.style === 'almanac', 'almanac style');
assert(almanac.styleLabel === '今日黄历', 'almanac 标题');
assert(almanac.yearGanzhi === '丙午', 'almanac 2026=丙午');
assert(almanac.shengxiao === '马', 'almanac 2026=马');
assert(Array.isArray(almanac.yi) && almanac.yi.length === 3, 'almanac 宜 3 条');
assert(Array.isArray(almanac.ji) && almanac.ji.length === 3, 'almanac 忌 3 条');
assert(almanac.luckyColor && almanac.luckyColor.hex, 'almanac 幸运色');
assert(almanac.luckyNum >= 1 && almanac.luckyNum <= 9, 'almanac 幸运数字 1-9');

// profile 融合黄历
const profWithAlmanac = fortune.genProfile({ dateKey: todayKey, profile, profileMode: 'comprehensive' });
assert(profWithAlmanac.styleLabel === '今日个人运势', 'profile 标题改为今日个人运势');
assert(profWithAlmanac.almanac && profWithAlmanac.almanac.yearGanzhi, 'profile 含黄历数据');

// moment 融合个人
const momentWithProfile = fortune.genHourFortune({ dateKey: todayKey, hourKey: '申', profile });
assert(momentWithProfile.styleLabel === '此刻个人运势', 'moment 标题改为此刻个人运势');
assert(momentWithProfile.personal && momentWithProfile.personal.shengxiao === '猪', 'moment 含个人生肖');

// ===== 第七阶段：运势精灵 =====
const spirit = require('./src/js/fortuneSpirit');
let sp = spirit.defaultSpirit();
assert(sp.boosts.综合 === 0 && sp.boosts.财运 === 0, 'spirit 初始加持全 0');
assert(spirit.DIMENSIONS.length === 5, 'spirit 五项维度');

// 摆位积累
sp = spirit.applyPosition(sp, 'metal', Date.now());  // 进入财位
assert(sp.positionWuxing === 'metal', 'spirit 摆位记录方位');
sp.positionSince = Date.now() - 6 * 60 * 1000;       // 模拟停留6分钟
sp = spirit.applyPosition(sp, 'metal', Date.now());
assert(sp.boosts.财运 === 1, 'spirit 摆位6分钟财运+1');

// 祈福
let br = spirit.bless(sp, '财运', '2026-08-24', Date.now());
assert(br.ok !== false && br.boost === 2, 'spirit 祈福财运+1（累计2）');
assert(br.remaining === 2, 'spirit 祈福后剩余2次');

// 每日限次
let sp2 = spirit.defaultSpirit();
sp2 = spirit.bless(sp2, '综合', '2026-08-24', Date.now()).spirit;
sp2 = spirit.bless(sp2, '爱情', '2026-08-24', Date.now()).spirit;
sp2 = spirit.bless(sp2, '事业', '2026-08-24', Date.now()).spirit;
const limitRes = spirit.bless(sp2, '财运', '2026-08-24', Date.now());
assert(limitRes.error === 'DAILY_LIMIT', 'spirit 第4次祈福触发限次');

// 上限
let sp3 = spirit.defaultSpirit();
sp3.boosts.财运 = 3;
const maxRes = spirit.bless(sp3, '财运', '2026-08-24', Date.now());
assert(maxRes.error === 'MAXED', 'spirit 财运满3不能再祈福');

// 五行→维度映射
assert(spirit.WUXING_TO_DIM.metal === '财运', 'spirit 金→财运');
assert(spirit.WUXING_TO_DIM.wood === '事业', 'spirit 木→事业');
assert(spirit.DIM_FIELDS.爱情.includes('感情'), 'spirit 爱情映射含感情字段');

// ===== 第五阶段：detector 模式匹配 + 行为打分日志 =====
const detector = require('./src/js/detector');
assert(Array.isArray(detector.PATTERNS) && detector.PATTERNS.length >= 6, 'detector 有至少 6 条规则');
assert(detector.classify('[T] [ERROR] [ai] HTTP_401', { status: 401 }).matched === true, 'detector 识别 auth');
assert(detector.classify('[T] [ERROR] [ai] NETWORK refused', {}).category === 'network', 'detector 识别 network');
assert(detector.classify('[T] [WARN] [x] nothing', {}).matched === false, 'detector 不误报 warn');
assert(detector.parseLevel('[2026-08-21T10:00:00.000Z] [CRITICAL] [x] y') === 'critical', 'parseLevel critical');

// behavior 打分仍正常（加了 logger 后不破坏逻辑）
const behaviorMod = require('./src/js/behavior');
const fakeBehavior = { traditional: { clicks: 5, view_seconds: 100, last_seen: Date.now() } };
const pickedStyle = behaviorMod.pickStyle({ traditional: { clicks: 3, view_seconds: 0, last_seen: Date.now() } });
assert(behaviorMod.STYLES.includes(pickedStyle), 'behavior.pickStyle 返回合法 style');
assert(typeof behaviorMod.recordInteraction(fakeBehavior, 'modern', 5) === 'object', 'recordInteraction 返回对象');

console.log(`\n总计: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
