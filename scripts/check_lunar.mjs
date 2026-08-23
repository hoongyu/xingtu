/* 农历逐日连续性自检。
 *
 * 为什么要这一道：lunar.js 原来的验证是「二十九个已知春节 + 十个已知闰月」，
 * 全中。可这两种锚点**都碰不到一岁的最后一个月** —— 春节在岁中，
 * 闰月也不会落在末月。于是最后一个月上界写成 Infinity 那个洞，
 * 三十九个锚点一个都没踩到，而它每年吞掉十二月里十几到三十天：
 * 1999-12-20 算成「十月第 43 天」，紫微盘的命宫、身宫、五行局跟着全错。
 *
 * 锚点验的是「几个点对不对」，连续性验的是「有没有洞」。
 * 这一道就是补后者：逐日走一遍，每一天要么比前一天多一，
 * 要么正好是新月份的初一，没有第三种可能。
 * 顺带查月长只能是二十九或三十，以及春节仍旧对得上。
 *
 *   node scripts/check_lunar.mjs [起年] [止年]
 * 退出码 0 干净，1 有问题。
 */
import { toLunar, springFestival } from '../web/lunar.js';

const DAY = 86400000;
const Y0 = +process.argv[2] || 1995, Y1 = +process.argv[3] || 2030;

/* 独立锚点。这些日子不是从这份代码算出来的 —— 是公开的历表。 */
const NEWYEAR = {
  1996: '02-19', 1999: '02-16', 2000: '02-05', 2001: '01-24', 2002: '02-12',
  2003: '02-01', 2004: '01-22', 2005: '02-09', 2010: '02-14', 2015: '02-19',
  2020: '01-25', 2021: '02-12', 2022: '02-01', 2023: '01-22', 2024: '02-10',
  2025: '01-29', 2026: '02-17', 2030: '02-03',
};

const bad = [];
let days = 0, months = 0;
let prev = null, curLen = 0, first = true;

for (let t = Date.UTC(Y0, 0, 1, 4, 0); t <= Date.UTC(Y1, 11, 31, 4, 0); t += DAY){
  const g = new Date(t).toISOString().slice(0, 10);
  const o = toLunar(t);
  days++;
  if (!o){ bad.push(`${g} 算不出`); prev = null; continue; }
  if (!(o.month >= 1 && o.month <= 12)) bad.push(`${g} 月序 ${o.month}`);
  if (!(o.day >= 1 && o.day <= 30)) bad.push(`${g} 日序 ${o.day}（一个月只有 29 或 30 天）`);
  if (prev){
    const same = o.year === prev.year && o.month === prev.month && o.leap === prev.leap;
    if (same){
      if (o.day !== prev.day + 1) bad.push(`${g} 同月内日序跳了 ${prev.day} → ${o.day}`);
      curLen++;
    } else {
      if (o.day !== 1)
        bad.push(`${g} 换月却不是初一（${prev.month}月${prev.day} → ${o.month}月${o.day}）`);
      // 头一个月是被窗口切断的，长度不作数
      if (!first && curLen !== 29 && curLen !== 30)
        bad.push(`${g} 前一个月长 ${curLen} 天（只能是 29 或 30）`);
      if (!first) months++;
      first = false;
      curLen = 1;
    }
  } else curLen = 1;
  prev = o;
}

let ny = 0;
for (const [y, want] of Object.entries(NEWYEAR)){
  const got = springFestival(+y).toISOString().slice(5, 10);
  if (got === want) ny++;
  else bad.push(`${y} 年春节算得 ${got}，历表是 ${want}`);
}

console.log(`农历自检 ${Y0}–${Y1}：逐日 ${days} 天，完整月 ${months} 个，`
          + `春节锚点 ${ny}/${Object.keys(NEWYEAR).length}`);
if (bad.length){
  console.log(`::error::农历有 ${bad.length} 处不对`);
  for (const b of bad.slice(0, 20)) console.log('  ' + b);
  if (bad.length > 20) console.log(`  …还有 ${bad.length - 20} 条`);
  process.exit(1);
}
console.log('  日序连续、月长只有 29/30、春节全中 —— 干净');
