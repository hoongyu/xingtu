/* 农历。紫微斗数按农历月日与时辰起盘，所以这一层是绕不过去的。
 *
 * 通行做法是嵌一张两百年的十六进制年表。那东西靠手抄，抄错一个数
 * 就是一整年的错盘，而且错了没有任何提示。这里改成**直接算** ——
 * 反正 ephem.js 里已经有验过的日月位置了。
 *
 * 用的是清代以来行用的「定朔定气」规则：
 *   一、月从朔到朔。含朔的那一天为初一，日界按东八区。
 *   二、含冬至的那个月定为十一月。
 *   三、两个十一月之间若有十三个月，则置闰；
 *       闰月取「第一个不含中气的月」，月序沿用前一个月。
 *   四、中气即太阳黄经为 30 度整倍数之处（冬至 270 度起）。
 *
 * 精度：朔的时刻由日月黄经差过零求得。月亮用的是截断的 ELP，
 * 误差约十角分，折合朔时约二十分钟 —— 只有当朔正好落在子夜前后
 * 二十分钟内才可能把初一算差一天。已用 1990–2026 年二十九个已知春节
 * 与十个已知闰月逐一核对，全中。
 */
import { compute } from './ephem.js?v=e6ac781a';

const DAY = 86400000;
const norm = a => ((a % 360) + 360) % 360;

const at = t => {
  const d = new Date(t);
  return compute(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600, 0, 0, 0);
};
/** 日月黄经差，取 (−180, 180]。过零即朔。 */
const elong = t => {
  const c = at(t);
  const e = norm(c.bodies['月亮'].lon - c.bodies['太阳'].lon);
  return e > 180 ? e - 360 : e;
};
const sunLon = t => at(t).bodies['太阳'].lon;

/** 东八区的「哪一天」。农历是中国的历法，日界按东八区，不按 UTC。 */
export const cnDay = t => Math.floor((t + 8 * 3600000) / DAY);

/** 扫描找 f 由负转正的点，再二分。两侧都要贴近零，免得把环绕当成解。 */
function roots(f, t0, t1, step){
  const out = [];
  let pt = t0, pv = f(pt);
  for (let t = t0 + step; t <= t1; t += step){
    const v = f(t);
    if (pv < 0 && v >= 0 && Math.abs(pv) + Math.abs(v) < 60){
      let lo = pt, hi = t;
      for (let i = 0; i < 40; i++){ const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
      out.push((lo + hi) / 2);
    }
    pt = t; pv = v;
  }
  return out;
}

/** 太阳黄经到达 deg 的时刻，在 [t0,t1] 内。 */
function termTime(deg, t0, t1){
  const f = t => { const d = norm(sunLon(t) - deg); return d > 180 ? d - 360 : d; };
  const r = roots(f, t0, t1, 0.5 * DAY);
  return r.length ? r[0] : null;
}

/** 某年冬至（太阳黄经 270 度）的时刻。 */
const winterSolstice = y => termTime(270, Date.UTC(y, 10, 20), Date.UTC(y, 11, 31));

/** [t0,t1] 内的所有朔。 */
const newMoons = (t0, t1) => roots(elong, t0, t1, 0.4 * DAY);

/* 一「岁」＝ 从含冬至的那个月（十一月）到下一个十一月。
   算出这一岁里每个月的起日与月序，闰月一并定下。 */
function sui(y){
  const ws0 = winterSolstice(y - 1), ws1 = winterSolstice(y);
  // 十一月的朔：含冬至那个月的月首
  const nm = newMoons(ws0 - 40 * DAY, ws1 + 40 * DAY);
  /* 按「日」比，不按时刻比。规则说的是「含冬至那一天的月」——
     2014 年正好卡在这上头：冬至在 UTC 12-21 22:56，朔在 UTC 12-22 01:37，
     按时刻冬至在朔之前，按东八区两者同在 12 月 22 日。
     拿时刻比会把十一月定到上一个月去，整岁月序错一位，春节差一个月。 */
  const startOf = t => {
    let s = null;
    for (const m of nm) if (cnDay(m) <= cnDay(t)) s = m;
    return s;
  };
  const m0 = startOf(ws0), m1 = startOf(ws1);
  const months = nm.filter(m => m >= m0 && m < m1);
  const leapYear = months.length === 13;

  // 每月是否含中气。中气＝黄经 30 度整倍数。
  const hasZhongQi = months.map((m, i) => {
    const end = i + 1 < months.length ? months[i + 1] : m1;
    for (let k = 0; k < 12; k++){
      const t = termTime(norm(270 + k * 30), m - 2 * DAY, end + 2 * DAY);
      // 同上：中气落在哪个月，也按东八区的日子算
      if (t != null && cnDay(t) >= cnDay(m) && cnDay(t) < cnDay(end)) return true;
    }
    return false;
  });

  let leapIdx = -1;
  if (leapYear) leapIdx = hasZhongQi.findIndex((h, i) => i > 0 && !h);

  // 从十一月起编号
  const out = [];
  let num = 11, leaped = false;
  months.forEach((m, i) => {
    if (leapIdx === i && !leaped){
      out.push({ start: m, month: num === 1 ? 12 : num - 1, leap: true });
      leaped = true;
      return;
    }
    out.push({ start: m, month: num, leap: false });
    num = num % 12 + 1;
  });
  return out;
}

const cache = new Map();
function suiCached(y){
  if (!cache.has(y)) cache.set(y, sui(y));
  return cache.get(y);
}

/** 公历（东八区时刻）转农历。传入 UTC 毫秒。 */
export function toLunar(ms){
  const d = cnDay(ms);
  // 一个日期可能属于本岁或上一岁，两岁都试
  const gy = new Date(d * DAY).getUTCFullYear();
  for (const y of [gy, gy + 1]){
    const ms_ = suiCached(y);
    for (let i = ms_.length - 1; i >= 0; i--){
      const s = cnDay(ms_[i].start);
      if (d >= s){
        const next = i + 1 < ms_.length ? cnDay(ms_[i + 1].start) : Infinity;
        if (d < next){
          // 农历年：正月初一起算。月序 ≥ 11 且在冬至之后的，属下一农历年之前
          const yearStart = ms_.find(x => x.month === 1 && !x.leap);
          const ly = d >= cnDay(yearStart.start) ? y : y - 1;
          return { year: ly, month: ms_[i].month, leap: ms_[i].leap, day: d - s + 1 };
        }
      }
    }
  }
  return null;
}

/** 该农历年的正月初一（公历），用来核对。 */
export function springFestival(y){
  const s = suiCached(y).find(x => x.month === 1 && !x.leap);
  return new Date(cnDay(s.start) * DAY);
}
