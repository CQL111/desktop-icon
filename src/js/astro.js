// astro.js - 天文计算（不依赖 Electron，smoke-test 可直接跑）
// 用 Meeus《Astronomical Algorithms》低精度公式计算：
//   - 太阳视黄经（用于判定二十四节气）
//   - 新月（朔）时刻（用于定农历月首）
// 以北京时间为基准（UTC+8）。1900–2100 有效；误差约 ±2 分钟，足以判定日期。
// 说明：立春、节气等均按「东八区时刻」的日期归属，与常见黄历一致。

const MS_PER_DAY = 86400000;
const J2000 = 2451545.0; // 2000-01-01 12:00 TT 的儒略日
const TZ_OFFSET_HOURS = 8; // 北京时间

// 公历日期 → 儒略日（当天 0 时，以 UTC+8 计）
function toJulianDayUTC(y, m, d, hour = 0, minute = 0, second = 0) {
  const h = hour + minute / 60 + second / 3600 - TZ_OFFSET_HOURS;
  let Y = y;
  let M = m;
  if (M <= 2) {
    Y -= 1;
    M += 12;
  }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const jd0 = Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5;
  return jd0 + h / 24;
}

// 儒略日 → 北京时间 {y,m,d,h,min}
function fromJulianDayUTC(jd) {
  const jdLocal = jd + TZ_OFFSET_HOURS / 24;
  const z = Math.floor(jdLocal + 0.5);
  const f = jdLocal + 0.5 - z;
  let a = z;
  if (z >= 2299161) {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const dd = Math.floor(365.25 * c);
  const e = Math.floor((b - dd) / 30.6001);
  const dayFloat = b - dd - Math.floor(30.6001 * e) + f;
  const day = Math.floor(dayFloat);
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  const frac = dayFloat - day;
  const totalMin = Math.round(frac * 24 * 60);
  let hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  let dd2 = day;
  // 四舍五入溢出到次日
  if (hh >= 24) {
    hh -= 24;
    dd2 += 1;
  }
  const norm = new Date(Date.UTC(year, month - 1, dd2));
  return {
    y: norm.getUTCFullYear(),
    m: norm.getUTCMonth() + 1,
    d: norm.getUTCDate(),
    h: hh,
    min: mm,
  };
}

// 儒略世纪数（TT 近似 UT）
function jc(jd) {
  return (jd - J2000) / 36525;
}

// 太阳视黄经（度，0–360）
function sunApparentLongitude(jd) {
  const T = jc(jd);
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T; // 平黄经
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * (Math.PI / 180); // 平近点角
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const trueLong = L0 + C;
  // 章动与光行差（简化）
  const omega = (125.04 - 1934.136 * T) * (Math.PI / 180);
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega);
  return ((lambda % 360) + 360) % 360;
}

// 求太阳视黄经达到 targetDeg 的时刻（jd 附近，牛顿迭代）
function solarLongitudeTime(targetDeg, jdGuess) {
  let jd = jdGuess;
  for (let i = 0; i < 12; i++) {
    const diff = ((targetDeg - sunApparentLongitude(jd) + 540) % 360) - 180;
    if (Math.abs(diff) < 1e-6) break;
    jd += diff * 0.98564736; // 每日黄经变化约 0.9856°
  }
  return jd;
}

// ---------- 二十四节气 ----------
// 按公历年内的时间顺序排列：小寒(285°) 大寒(300°) 立春(315°) ... 冬至(270°)
// 立春=315°、春分=0°、夏至=90°、秋分=180°、冬至=270°
const TERM_SEQ = [
  { name: '小寒', lon: 285 },
  { name: '大寒', lon: 300 },
  { name: '立春', lon: 315 },
  { name: '雨水', lon: 330 },
  { name: '惊蛰', lon: 345 },
  { name: '春分', lon: 0 },
  { name: '清明', lon: 15 },
  { name: '谷雨', lon: 30 },
  { name: '立夏', lon: 45 },
  { name: '小满', lon: 60 },
  { name: '芒种', lon: 75 },
  { name: '夏至', lon: 90 },
  { name: '小暑', lon: 105 },
  { name: '大暑', lon: 120 },
  { name: '立秋', lon: 135 },
  { name: '处暑', lon: 150 },
  { name: '白露', lon: 165 },
  { name: '秋分', lon: 180 },
  { name: '寒露', lon: 195 },
  { name: '霜降', lon: 210 },
  { name: '立冬', lon: 225 },
  { name: '小雪', lon: 240 },
  { name: '大雪', lon: 255 },
  { name: '冬至', lon: 270 },
];
const TERMS = TERM_SEQ.map((t) => t.name);

// 返回某公历年内的 24 个节气（按时间顺序），带北京时间的年/月/日/时/分
function solarTermsInYear(year) {
  const out = [];
  // 从 1 月 1 日开始，按顺序求每个节气；每次从上一个节气之后继续
  let jd = dayStartJd(year, 1, 1);
  for (const t of TERM_SEQ) {
    const hit = solarLongitudeTime(t.lon, jd);
    const date = fromJulianDayUTC(hit);
    out.push({ name: t.name, lon: t.lon, ...date, jd: hit });
    // 下一个节气起点：已命中时刻之后 1 天再找
    jd = hit + 1;
  }
  return out;
}

// 节气日期归属（北京时间）
function termOnDate(y, m, d) {
  return solarTermsInYear(y).find((t) => t.y === y && t.m === m && t.d === d) || null;
}

// 某天之前最近的节气（用于“距立春多少天”等判断）
function lastTermBefore(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const terms = solarTermsInYear(y).filter((t) => {
    const key = `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
    return key <= dateKey;
  });
  return terms.length ? terms[terms.length - 1] : null;
}

// ---------- 新月（朔） ----------
// Meeus 第 49 章：平均朔 + 主要周期项，精度约 ±40 分钟
function newMoonJd(k) {
  // k 为从 2000-01-06 附近的朔起算的整数或半整数（新月的 k 为整数）
  const T = k / 1236.85;
  const jde =
    2451550.09766 +
    29.530588861 * k +
    0.00015437 * T * T -
    0.00000015 * T * T * T +
    0.00000000073 * T * T * T * T;
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T * T - 0.00000011 * T * T * T) * (Math.PI / 180);
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T * T + 0.00001238 * T * T * T) * (Math.PI / 180);
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T * T - 0.00000227 * T * T * T) * (Math.PI / 180);
  const Om = (124.7746 - 1.56375588 * k + 0.0020672 * T * T + 0.00000215 * T * T * T) * (Math.PI / 180);
  let corr = 0;
  corr -= 0.4072 * Math.sin(Mp);
  corr += 0.17241 * Math.sin(M);
  corr += 0.01608 * Math.sin(2 * Mp);
  corr += 0.01039 * Math.sin(2 * F);
  corr += 0.00739 * Math.sin(Mp - M);
  corr -= 0.00514 * Math.sin(Mp + M);
  corr += 0.00208 * Math.sin(2 * M);
  corr -= 0.00111 * Math.sin(Mp - 2 * F);
  corr -= 0.00057 * Math.sin(Mp + 2 * F);
  corr += 0.00056 * Math.sin(2 * Mp + M);
  corr -= 0.00042 * Math.sin(3 * Mp);
  corr += 0.00042 * Math.sin(M + 2 * F);
  corr += 0.00038 * Math.sin(M - 2 * F);
  corr -= 0.00024 * Math.sin(2 * Mp - M);
  corr -= 0.00017 * Math.sin(Om);
  corr -= 0.00007 * Math.sin(Mp + 2 * M);
  corr += 0.00004 * Math.sin(2 * Mp - 2 * F);
  corr += 0.00004 * Math.sin(3 * M);
  corr += 0.00003 * Math.sin(Mp + M - 2 * F);
  corr += 0.00003 * Math.sin(2 * Mp + 2 * F);
  corr -= 0.00003 * Math.sin(Mp + M + 2 * F);
  corr += 0.00003 * Math.sin(Mp - M + 2 * F);
  corr -= 0.00002 * Math.sin(Mp - M - 2 * F);
  corr -= 0.00002 * Math.sin(3 * Mp + M);
  corr += 0.00002 * Math.sin(4 * Mp);
  // 修正为视朔（含 ΔT 近似）
  const deltaT = 0.0009; // 2000 年前后约 64 秒，近似为天
  return jde + corr - deltaT;
}

// 儒略日转「北京日期」的当天 0 点儒略日（用于判断农历月首落在哪一天）
function jdToBeijingDayKey(jd) {
  const dt = fromJulianDayUTC(jd);
  return { key: `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`, ...dt };
}

// 公历日期 → 当天 0 点（北京）的儒略日
function dayStartJd(y, m, d) {
  return toJulianDayUTC(y, m, d, 0, 0, 0);
}

// 两个公历日期间的儒略日差
function jdFromDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return toJulianDayUTC(y, m, d, 0, 0, 0);
}

function dateKeyFromJd(jd) {
  const dt = fromJulianDayUTC(jd);
  return `${dt.y}-${String(dt.m).padStart(2, '0')}-${String(dt.d).padStart(2, '0')}`;
}

// 返回某儒略日附近的下一个/上一个朔的 k 值
function kAroundJd(jd) {
  return Math.round((jd - 2451550.09766) / 29.530588861);
}

module.exports = {
  TERMS,
  TERM_SEQ,
  MS_PER_DAY,
  toJulianDayUTC,
  fromJulianDayUTC,
  sunApparentLongitude,
  solarLongitudeTime,
  solarTermsInYear,
  termOnDate,
  lastTermBefore,
  newMoonJd,
  kAroundJd,
  jdToBeijingDayKey,
  dayStartJd,
  jdFromDateKey,
  dateKeyFromJd,
};
