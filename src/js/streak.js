// streak.js - 连续看运天数（纯逻辑，smoke-test 可直接跑）
// 规则：同一天多次查看只算一次；昨天看过则 +1；断签不清零，降为 1（温和）。
// 说明：用户修改系统时间可以刷天数，自用可接受（与精灵每日限次一致）。

function defaultStreak() {
  return { count: 0, best: 0, lastDate: '' };
}

// 从 YYYY-MM-DD 往前/后推 n 天（本地日历，不经过 UTC）
function shiftDateKey(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * 记录一次「查看今日运势」。
 * @param {{count:number,best:number,lastDate:string}} state
 * @param {string} todayKey YYYY-MM-DD（本地）
 * @returns {{state:object, changed:boolean, streak:number, broke:boolean}}
 */
function checkIn(state, todayKey) {
  const cur = state && typeof state === 'object' ? { ...defaultStreak(), ...state } : defaultStreak();
  if (!todayKey) return { state: cur, changed: false, streak: cur.count || 0, broke: false };
  if (cur.lastDate === todayKey) {
    return { state: cur, changed: false, streak: cur.count || 0, broke: false };
  }
  const yesterday = shiftDateKey(todayKey, -1);
  let nextCount;
  let broke = false;
  if (cur.lastDate === yesterday) {
    nextCount = (cur.count || 0) + 1;
  } else {
    // 断签：不清零，从 1 重新开始（保留 best 记录）
    nextCount = 1;
    broke = !!cur.lastDate && cur.lastDate !== yesterday;
  }
  const next = {
    count: nextCount,
    best: Math.max(cur.best || 0, nextCount),
    lastDate: todayKey,
  };
  return { state: next, changed: true, streak: nextCount, broke };
}

module.exports = { defaultStreak, shiftDateKey, checkIn };
