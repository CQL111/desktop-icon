// lunar.js - 中国农历（基于 astro.js 的朔与节气计算）
// 规则：月首 = 北京时间朔日；冬至所在月为十一月；两个冬至月之间若无中气的月为闰月。
// 提供：公历 → 农历（年月日、闰月）、农历月日中文名、节气日期。
// 纯 Node，可在 smoke-test 直接断言。

const astro = require('./astro');

const MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_TENS = ['初', '十', '廿', '三'];
const DAY_UNITS = ['十', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function lunarDayName(d) {
  if (d === 10) return '初十';
  if (d === 20) return '二十';
  if (d === 30) return '三十';
  const tens = Math.floor(d / 10);
  const unit = d % 10;
  return DAY_TENS[tens] + DAY_UNITS[unit];
}

function lunarMonthName(month, leap) {
  return (leap ? '闰' : '') + MONTH_NAMES[month - 1] + '月';
}

// 求 [fromJd, toJd) 之间的所有朔（按北京时间日期去重，同一天只算一次月首）
function newMoonsBetween(fromJd, toJd) {
  const out = [];
  let k = astro.kAroundJd(fromJd) - 1;
  let jd = astro.newMoonJd(k);
  while (jd < fromJd) {
    k += 1;
    jd = astro.newMoonJd(k);
  }
  while (jd < toJd) {
    const day = astro.jdToBeijingDayKey(jd);
    // 同一个北京日期只保留第一次（极少数情况下相邻朔可能落在同一日）
    if (!out.length || out[out.length - 1].key !== day.key) {
      out.push({ jd, key: day.key, y: day.y, m: day.m, d: day.d });
    }
    k += 1;
    jd = astro.newMoonJd(k);
  }
  return out;
}

// 某个月内是否含有中气（lon % 30 == 0 的节气）
// 按北京「日期」判定：节气日落在 [月首日, 次月首日) 内即算本月，和官方黄历口径一致
function hasZhongqi(startKey, endKey, terms) {
  return terms.some((t) => {
    if (t.lon % 30 !== 0) return false;
    const key = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
    return key >= startKey && key < endKey;
  });
}

/**
 * 计算农历年（以冬至月为十一月，闰月用无中气规则）
 * @param {number} gregYear 公历年
 * @returns {Array<{month:number, leap:boolean, startJd:number, endJd:number, days:number}>}
 */
function lunarMonthsOfYear(gregYear) {
  // 取上一年冬至作为起点：十一月 = 冬至所在月
  const terms = astro.solarTermsInYear(gregYear);
  const prevTerms = astro.solarTermsInYear(gregYear - 1);
  const dongzhi = prevTerms.find((t) => t.name === '冬至').jd;
  const nextDongzhi = terms.find((t) => t.name === '冬至').jd;

  // 冬至所在月：不晚于冬至的最近一个朔
  const allNewMoons = newMoonsBetween(dongzhi - 40, nextDongzhi + 40);
  let idx = -1;
  for (let i = 0; i < allNewMoons.length; i++) {
    if (allNewMoons[i].jd <= dongzhi) idx = i;
    else break;
  }
  if (idx < 0) return [];

  // 从十一月开始编号：11,12,1,2,... 遇到无中气月则置闰（沿用上一个月号）
  const months = [];
  let monthNo = 11;
  let leapUsed = false;
  const allTerms = prevTerms.concat(terms);
  for (let i = idx; i < allNewMoons.length - 1; i++) {
    // 月界按「朔所在的北京日期 0 点」计算，公历日期才能正确落入本月
    const startInstant = allNewMoons[i].jd;
    const endInstant = allNewMoons[i + 1].jd;
    const startJd = astro.dayStartJd(allNewMoons[i].y, allNewMoons[i].m, allNewMoons[i].d);
    const endJd = astro.dayStartJd(allNewMoons[i + 1].y, allNewMoons[i + 1].m, allNewMoons[i + 1].d);
    const nextKey = allNewMoons[i + 1].key;
    const leap = !hasZhongqi(allNewMoons[i].key, nextKey, allTerms) && !leapUsed && months.length > 0;
    // 闰月沿用「上一个月」的月号（而不是下一个）
    const displayMonth = leap ? (monthNo === 1 ? 12 : monthNo - 1) : monthNo;
    months.push({
      startJd,
      endJd,
      startInstant,
      startKey: allNewMoons[i].key,
      month: displayMonth,
      leap,
      days: Math.round(endJd - startJd),
    });
    if (leap) leapUsed = true;
    else {
      monthNo += 1;
      if (monthNo > 12) monthNo = 1;
    }
    // 到达下一个十一月（含冬至）即结束
    if (startInstant >= nextDongzhi) break;
  }
  return months;
}

/**
 * 公历日期 → 农历
 * @param {string} dateKey YYYY-MM-DD
 * @returns {{year:number, month:number, day:number, leap:boolean, monthName:string, dayName:string, full:string, monthDays:number}}
 */
function fromDateKey(dateKey) {
  const jd = astro.jdFromDateKey(dateKey);
  const [gy] = String(dateKey).split('-').map(Number);
  // 农历年跨公历年：先看当年与下一年的月表，找到包含该日的月份
  const candidates = [];
  for (const y of [gy - 1, gy, gy + 1]) {
    for (const mo of lunarMonthsOfYear(y)) candidates.push({ ...mo, gregYear: y });
  }
  const hit = candidates
    .filter((mo) => jd >= mo.startJd && jd < mo.endJd)
    .sort((a, b) => a.startJd - b.startJd)[0];
  if (!hit) return null;
  // 农历年份：正月（month=1，非闰）所在公历年
  const zhengyue = candidates
    .filter((mo) => mo.month === 1 && !mo.leap)
    .sort((a, b) => a.startJd - b.startJd)
    .find((mo) => mo.startJd <= jd);
  const lunarYear = zhengyue ? zhengyue.gregYear : gy;
  const day = Math.floor(jd - hit.startJd) + 1;
  const monthName = lunarMonthName(hit.month, hit.leap);
  const dayName = lunarDayName(day);
  return {
    year: lunarYear,
    month: hit.month,
    day,
    leap: hit.leap,
    monthDays: Math.round(hit.endJd - hit.startJd),
    monthName,
    dayName,
    full: `${monthName}${dayName}`,
  };
}

/**
 * 判断某天是否是节气日，并返回节气信息
 */
function termOnDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return astro.termOnDate(y, m, d);
}

// 某天所属的「节气月」地支（立春→寅，惊蛰→卯 ...）
const TERM_TO_BRANCH = {
  立春: '寅', 惊蛰: '卯', 清明: '辰', 立夏: '巳', 芒种: '午', 小暑: '未',
  立秋: '申', 白露: '酉', 寒露: '戌', 立冬: '亥', 大雪: '子', 小寒: '丑',
};

function solarMonthBranch(dateKey) {
  const last = astro.lastTermBefore(dateKey);
  if (!last) return '寅';
  const branch = TERM_TO_BRANCH[last.name];
  if (branch) return branch;
  // 非十二「节」的节气（如雨水），沿用上一个节
  const order = ['立春', '惊蛰', '清明', '立夏', '芒种', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
  const [y] = String(dateKey).split('-').map(Number);
  const terms = astro.solarTermsInYear(y).filter((t) => order.includes(t.name));
  let branch2 = '寅';
  for (const t of terms) {
    const key = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
    if (key <= dateKey) branch2 = TERM_TO_BRANCH[t.name];
  }
  return branch2;
}

module.exports = {
  fromDateKey,
  lunarMonthsOfYear,
  termOnDateKey,
  solarMonthBranch,
  lunarDayName,
  lunarMonthName,
  newMoonsBetween,
};
