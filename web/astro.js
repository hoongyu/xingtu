/* 星盘：排盘、解析与呈现。
 *
 * 立场写在页面上，这里再说一遍：行星位置是真算的（ephem.js，天文），
 * 怎么解读是传统的说法（astrodata.json，文化）。两者在界面上分开标注。
 *
 * 结构上最有意思的一处：同一批行星，西洋按黄道分十二宫（等分 30 度），
 * 中国七政四余按赤道分二十八宿（宿度不等，井 32.2 度、觜 1.4 度）。
 * 换一次坐标系，盘面重排、读法也整个换掉 ——
 * 早先只换了盘面没换读法，那等于中式的圈套着西洋的话，是个缺陷。
 *
 * 出生数据只在浏览器里算，不发往任何服务器。
 */
import { compute, houses, houseOf, aspects } from './ephem.js?v=8c8e7925';
import { PLACES, label as placeLabel } from './places.js?v=3deca637';

const NS = 'http://www.w3.org/2000/svg';
const R = 340;
const $ = id => document.getElementById(id);
const norm = a => ((a % 360) + 360) % 360;
const wait = ms => new Promise(r => setTimeout(r, ms));

// plain 默认为真 —— 这一页先要说得懂，术语版是给想看原措辞的人留的选项。
let DATA, chart = null, mode = 'west', plain = true, hsys = 'whole';
let pick = { y: 2000, m: 1, d: 1 };            // 默认停在 2000-01-01
let calY = 2000, calM = 1;
let revealToken = 0;
const narrow = matchMedia('(max-width: 820px)');


/* ── 盘面几何 ──────────────────────────────────
   上升点摆在左边、黄道逆时针展开，是星盘两千年的画法。
   SVG 的 y 轴朝下，所以这里 sin 不取反 —— 校验：
   偏 0° 在左（上升），90° 在下（天底），180° 在右（下降），270° 在上（天顶）。*/
function pos(deg, r){
  const a = deg * Math.PI / 180;
  return [-Math.cos(a) * r, Math.sin(a) * r];
}
const ref = () => mode === 'west' ? chart.asc : chart.xiuStart;
const off = lon => norm(lon - ref());

function arcPath(a0, a1, r0, r1){
  const [x0, y0] = pos(a0, r1), [x1, y1] = pos(a1, r1);
  const [x2, y2] = pos(a1, r0), [x3, y3] = pos(a0, r0);
  const big = norm(a1 - a0) > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r1} ${r1} 0 ${big} 1 ${x1} ${y1} `
       + `L${x2} ${y2} A${r0} ${r0} 0 ${big} 0 ${x3} ${y3} Z`;
}

const el = (t, attrs = {}, cls) => {
  const n = document.createElementNS(NS, t);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (cls) n.setAttribute('class', cls);
  return n;
};

/* ── 小日历 ─────────────────────────────────────
   生日拆成三个数字框的时候，得先想清楚再敲。做成月历就只剩一次点击，
   翻月的时候还顺手能看见星期几。默认停在 2000-01-01。 */
function calendar(){
  const box = $('cal');
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'calhead';
  const mk = (t, fn, cls) => {
    const b = document.createElement('span');
    b.className = cls || 'calnav'; b.textContent = t;
    if (fn) b.addEventListener('click', fn);
    return b;
  };
  head.append(
    mk('«', () => { calY--; calendar(); }),
    mk('‹', () => { calM--; if (calM < 1){ calM = 12; calY--; } calendar(); }),
    mk(`${calY} 年 ${calM} 月`, null, 'caltitle'),
    mk('›', () => { calM++; if (calM > 12){ calM = 1; calY++; } calendar(); }),
    mk('»', () => { calY++; calendar(); }));
  box.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'calgrid';
  for (const w of ['日', '一', '二', '三', '四', '五', '六']){
    const c = document.createElement('span');
    c.className = 'calwk'; c.textContent = w; grid.appendChild(c);
  }
  // 用 UTC 构造，免得本机时区把 1 号推到上个月去
  const first = new Date(Date.UTC(calY, calM - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(calY, calM, 0)).getUTCDate();
  for (let i = 0; i < first; i++) grid.appendChild(document.createElement('span'));
  for (let d = 1; d <= days; d++){
    const c = document.createElement('span');
    c.className = 'calday'; c.textContent = d;
    if (calY === pick.y && calM === pick.m && d === pick.d) c.classList.add('on');
    c.addEventListener('click', () => {
      pick = { y: calY, m: calM, d };
      calendar();
    });
    grid.appendChild(c);
  }
  box.appendChild(grid);
  $('dstamp').textContent = `${pick.y} 年 ${pick.m} 月 ${pick.d} 日`;
}

/* ── 排盘 ───────────────────────────────────── */
function cast(){
  const hh = +$('bh').value, mm = +$('bmin').value;
  const ci = +$('bcity').value;
  const dst = $('bdst').checked ? 1 : 0;
  const [pname, anchor, lat, lon, tz] = PLACES[ci];

  const c = compute(pick.y, pick.m, pick.d, hh + mm / 60, tz + dst, lat, lon);
  c.city = pname; c.anchor = anchor; c.lat = lat; c.lon = lon;
  // 顶栏那个戳要带上参照点：同一个省现在可能有两条（太原／大同、
  // 南京／扬州），只写省名的话看不出算的是哪一个。
  c.label = placeLabel(PLACES[ci]);
  c.cusp = houses(hsys, c.asc, c.mc);
  const names = DATA.planets.map(p => p.n)
    .filter(n => n !== '上升' && n !== '天顶' && n !== '南交点');
  c.asp = aspects(c.bodies, DATA.aspects, names)
    .sort((a, b) => a.orb - b.orb);         // 容许度越小越紧，紧的排前面

  // 中式：按赤经定宿。角宿是二十八宿之首，摆在盘的左边。
  c.xiuStart = DATA.mansions.find(m => m.n === '角').ra;
  for (const b of Object.values(c.bodies)){
    b.sign = Math.floor(b.lon / 30);
    b.deg = b.lon % 30;
    b.house = houseOf(b.lon, c.cusp);
    b.xiu = DATA.mansions.findIndex(m => norm(b.ra - m.ra) < m.deg);
    if (b.xiu < 0) b.xiu = 0;
    b.rudu = norm(b.ra - DATA.mansions[b.xiu].ra);   // 入宿度
  }
  /* 下面几样都是从已算出的位置直接读出来的天文量，不掺解释。
     摆在解析最前面，是想让人先看见「这一刻天上是什么样」，
     再看后面那些传统说法怎么由它引出来。 */

  // 节气就是太阳黄经的刻度：每 15 度一个，春分定在 0 度。
  const sl = c.bodies['太阳'].lon;
  c.jieqi = DATA.jieqi[Math.floor(sl / 15) % 24];
  c.jieqiDeg = sl % 15;

  // 月相看日月黄经差：0 度为朔，180 度为望。按 45 度分八档，
  // 边界要偏移半档，否则「朔」只在正好 0–45 度那一段成立。
  c.elong = norm(c.bodies['月亮'].lon - sl);
  c.phase = DATA.phase[Math.floor((c.elong + 22.5) / 45) % 8];
  c.moonAge = c.elong / 360 * 29.53059;          // 朔望月长度

  // 命主星：上升星座的传统主星。古典盘的读法从这颗星起。
  c.ruler = DATA.signs[Math.floor(c.asc / 30)].r0;

  /* 入相还是出相 —— 相位在收紧还是在散开。判法是再算一次一小时后的盘，
     看容许度变小还是变大。古典占星里这个区别很重，入相是「还没到」，
     出相是「已经过去」。这一条也是算出来的，不是判断出来的。 */
  const later = compute(pick.y, pick.m, pick.d, hh + mm / 60 + 1,
                        tz + dst, lat, lon);
  const sep = (bd, x, y) => {
    let d = Math.abs(norm(bd[x].lon - bd[y].lon));
    return d > 180 ? 360 - d : d;
  };
  for (const a of c.asp){
    const target = DATA.aspects.find(x => x.n === a.type).a;
    a.moving = Math.abs(sep(later.bodies, a.a, a.b) - target) < a.orb
      ? '入相' : '出相';
  }

  /* ── 落到生活上的那几层，需要的几个量 ───────────────────
     宫主星：一个宫头落在哪个星座，那个星座的传统主星就是这一宫的主星。
     传统上看「这件事从哪儿来」就看宫主星落在第几宫 —— 七宫主看伴侣
     从哪儿遇上，十宫主看事业机会从哪儿来。同一条规矩，两处用。 */
  const rulerOf = lonDeg => DATA.signs[Math.floor(norm(lonDeg) / 30)].r0;
  c.h7 = { sign: DATA.signs[Math.floor(norm(c.cusp[6]) / 30)].n,
           ruler: rulerOf(c.cusp[6]) };
  c.h2 = { sign: DATA.signs[Math.floor(norm(c.cusp[1]) / 30)].n,
           ruler: rulerOf(c.cusp[1]) };
  c.h10 = { sign: DATA.signs[Math.floor(norm(c.cusp[9]) / 30)].n,
            ruler: rulerOf(c.cusp[9]) };
  c.mcSign = DATA.signs[Math.floor(norm(c.mc) / 30)].n;

  /* ── 时机 ───────────────────────────────────────────────
     这一节的年份是**算出来的**：把行星推到它回到出生黄经的那一刻。
     做法是先用平均周期估一个日子，再迭代几次收敛 ——
     每次拿当天的实际黄经与本命黄经作差，按平均速度折算成天数补上。
     六次足够收到一天以内。

     一个必须说明白的地方：土星会逆行，所以它回到本命位置这件事
     实际会来回发生三次，前后拖约一年。下面写的是中间那一次的估计，
     所以措辞用「约」，不给假的精确。 */
  const DAY = 86400000;
  const atUTC = dt => compute(dt.getUTCFullYear(), dt.getUTCMonth() + 1,
    dt.getUTCDate(), dt.getUTCHours() + dt.getUTCMinutes() / 60, 0, lat, lon);
  const birthUTC = new Date(Date.UTC(pick.y, pick.m - 1, pick.d, 0,
    Math.round((hh + mm / 60 - tz - dst) * 60)));

  /* 求回归：粗扫找过零点，再二分。
     不用「按平均速度迭代」那种解法 —— 试过，木星上不收敛：
     它每年逆行约四个月，实际速度在 +0.24 到 -0.14 度/日之间摆，
     按平均速度补步长会走错方向，实测误差到 19 度。
     改成扫描之后误差落在 0.0002 度以内，一次求解约 3 毫秒。

     返回的是一个数组而不是一个日子：行星逆行时会来回三次经过本命位置，
     前后能拖一年。那是真实现象，不该被抹成一个「约」。 */
  function returnsOf(name, periodY, k){
    const natal = c.bodies[name].lon;
    const g = t => { const d = norm(atUTC(new Date(t)).bodies[name].lon - natal);
                     return d > 180 ? d - 360 : d; };
    const mid = birthUTC.getTime() + periodY * k * 365.2422 * DAY;
    const W = 400 * DAY, S = 4 * DAY;
    const hits = [];
    let pt = mid - W, pv = g(pt);
    for (let t = pt + S; t <= mid + W; t += S){
      const v = g(t);
      // 两侧都靠近 0 才算真过零 —— 否则 ±180 那个环绕点会被当成解
      if (pv * v < 0 && Math.abs(pv) + Math.abs(v) < 12){
        let lo = pt, hi = t, flo = pv;
        for (let i = 0; i < 24; i++){
          const m = (lo + hi) / 2, fm = g(m);
          if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; }
        }
        hits.push(new Date((lo + hi) / 2));
      }
      pt = t; pv = v;
    }
    return hits;
  }
  c.saturnReturn = [returnsOf('土星', 29.457, 1), returnsOf('土星', 29.457, 2)];
  c.jupiterReturns = [1, 2, 3, 4, 5, 6, 7].map(k => returnsOf('木星', 11.862, k));
  // 当下的行运：慢的两颗才够得上「时机」，快的一年跑好几圈，说了等于没说。
  const nowC = atUTC(new Date());
  c.now = { date: new Date(), bodies: nowC.bodies };
  c.transit = ['木星', '土星'].map(n => ({
    n, lon: nowC.bodies[n].lon,
    sign: DATA.signs[Math.floor(nowC.bodies[n].lon / 30)].n,
    house: houseOf(nowC.bodies[n].lon, c.cusp),
  }));

  chart = c;
  draw();
  $('stamp').textContent =
    `${pick.y}-${String(pick.m).padStart(2,'0')}-${String(pick.d).padStart(2,'0')} `
    + `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} · ${c.label}`;
  runReading();
}

/* ── 画盘 ───────────────────────────────────── */
function draw(){
  const svg = $('wheel');
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `${-R*1.18} ${-R*1.18} ${R*2.36} ${R*2.36}`);
  const gRing = el('g'), gSpoke = el('g'), gAsp = el('g'), gBody = el('g');
  svg.append(gAsp, gRing, gSpoke, gBody);

  const outer = R, inner = R * .84, hRing = R * .70, ringP = R * .77;

  if (mode === 'west'){
    DATA.signs.forEach((s, i) => {
      const p = el('path', { d: arcPath(off(i*30), off(i*30+30), inner, outer) },
                   `sec el-${s.el}`);
      p.addEventListener('click', () => show('sign', i));
      p.addEventListener('mousemove', e => card(e, s.n + '座', plain ? s.p : s.t));
      p.addEventListener('mouseleave', hideCard);
      gRing.appendChild(p);
      const [tx, ty] = pos(off(i*30 + 15), (inner + outer) / 2);
      const g = el('text', { x: tx, y: ty + 7 }, 'glyph');
      g.textContent = s.g; gRing.appendChild(g);
    });
    chart.cusp.forEach((cu, i) => {
      const a = off(cu);
      const [x0, y0] = pos(a, hRing), [x1, y1] = pos(a, inner);
      gSpoke.appendChild(el('line', { x1: x0, y1: y0, x2: x1, y2: y1 },
                            i % 3 === 0 ? 'spoke ax' : 'spoke'));
      const mid = off(cu + norm(chart.cusp[(i+1)%12] - cu) / 2);
      const [hx, hy] = pos(mid, hRing + 16);
      const t = el('text', { x: hx, y: hy + 4 }, 'hnum');
      t.textContent = i + 1;
      t.addEventListener('click', () => show('house', i));
      gSpoke.appendChild(t);
    });
    for (const a of chart.asp){
      const [x0, y0] = pos(off(chart.bodies[a.a].lon), hRing - 8);
      const [x1, y1] = pos(off(chart.bodies[a.b].lon), hRing - 8);
      const ln = el('line', { x1: x0, y1: y0, x2: x1, y2: y1 },
                    'asp ' + DATA.aspects.find(d => d.n === a.type).k);
      ln.addEventListener('click', () => show('asp', a));
      ln.addEventListener('mousemove',
        e => card(e, `${a.a} ${a.type} ${a.b}`,
                  `相差 ${a.exact.toFixed(1)}°，容许 ${a.orb.toFixed(1)}°`));
      ln.addEventListener('mouseleave', hideCard);
      gAsp.appendChild(ln);
    }
  } else {
    // 中式：二十八宿，宿度不等 —— 这一圈的疏密本身就是内容
    DATA.mansions.forEach((m, i) => {
      const p = el('path', { d: arcPath(off(m.ra), off(m.ra + m.deg), inner, outer) },
                   'sec xiang-' + m.xiang[0]);
      p.addEventListener('click', () => show('xiu', i));
      p.addEventListener('mousemove', e => card(e, m.n + '宿',
        `${m.xiang}　宿度 ${m.deg.toFixed(1)}°　分野 ${m.guo}·${m.zhou}`));
      p.addEventListener('mouseleave', hideCard);
      gRing.appendChild(p);
      const [tx, ty] = pos(off(m.ra + m.deg / 2), (inner + outer) / 2);
      const t = el('text', { x: tx, y: ty + 5 }, 'xname');
      t.textContent = m.n; gRing.appendChild(t);
    });
    DATA.ci.forEach((c, i) => {
      const p = el('path', { d: arcPath(off(chart.xiuStart + i*30),
                                        off(chart.xiuStart + i*30 + 30),
                                        hRing, inner - 6) }, 'ci');
      p.addEventListener('click', () => show('ci', i));
      gRing.appendChild(p);
      const [tx, ty] = pos(off(chart.xiuStart + i*30 + 15), (hRing + inner) / 2);
      const t = el('text', { x: tx, y: ty + 4 }, 'cname');
      t.textContent = c.n; gRing.appendChild(t);
    });
  }

  // 行星
  // 手机上盘面缩放只有 0.425，r=15 的点在屏幕上直径才 13px，手指点不中。
  // 视觉上的点略放大，另外垫一层透明的大命中圈；避让角度跟着一起放大，
  // 不然放大后的点会互相压住。
  const DOT = narrow.matches ? 22 : 15;
  const HIT = narrow.matches ? 36 : 22;
  const SEP = narrow.matches ? 11 : 6.5;
  const placed = [];
  for (const p of DATA.planets){
    const b = chart.bodies[p.n];
    if (!b) continue;
    if (mode === 'east' && (p.n === '上升' || p.n === '天顶')) continue;
    let a = off(mode === 'west' ? b.lon : b.ra);
    const gap = q => { const d = norm(a - q); return Math.min(d, 360 - d); };
    while (placed.some(q => gap(q) < SEP)) a = norm(a + SEP);
    placed.push(a);
    const [x, y] = pos(a, ringP);
    const g = el('g', {}, 'body');
    g.appendChild(el('circle', { cx: x, cy: y, r: HIT, fill: 'transparent' }));
    g.appendChild(el('circle', { cx: x, cy: y, r: DOT }, 'bdot'));
    const t = el('text', { x, y: y + 7 }, 'bglyph');
    // 中式盘用中名的头一个字（日月水金火木土罗计），西洋盘用符号
    t.textContent = mode === 'east' && p.cn !== '—' ? p.cn[0] : p.g;
    g.appendChild(t);
    const [lx, ly] = pos(a, ringP - 30);
    const dg = el('text', { x: lx, y: ly + 4 }, 'bdeg');
    dg.textContent = mode === 'west' ? `${b.deg.toFixed(0)}°`
                                     : `${b.rudu.toFixed(0)}°`;
    g.appendChild(dg);
    g.addEventListener('click', () => show('planet', p.n));
    g.addEventListener('mousemove', e => card(e, label(p), brief(p.n)));
    g.addEventListener('mouseleave', hideCard);
    gBody.appendChild(g);
  }

  gRing.appendChild(el('circle', { r: hRing }, 'gui'));
  gRing.appendChild(el('circle', { r: inner }, 'gui'));
  gRing.appendChild(el('circle', { r: outer }, 'gui'));
  if (mode === 'west'){
    for (const [lon, txt] of [[chart.asc, '上升'], [chart.mc, '天顶']]){
      const [mx, my] = pos(off(lon), outer + 22);
      const t = el('text', { x: mx, y: my + 5 }, 'mark');
      t.textContent = txt; gRing.appendChild(t);
    }
  } else {
    const [mx, my] = pos(0, outer + 22);
    const t = el('text', { x: mx, y: my + 5 }, 'mark');
    t.textContent = '角宿'; gRing.appendChild(t);
  }
}

/* ── 文案 ───────────────────────────────────── */
const label = p => mode === 'east' && p.cn !== '—' ? `${p.cn}（${p.n}）` : p.n;
const key = o => plain ? o.kp : o.kt;

function brief(name){
  const b = chart.bodies[name];
  if (!b) return '';
  if (mode === 'west')
    return `${DATA.signs[b.sign].n}座 ${b.deg.toFixed(1)}°　第 ${b.house + 1} 宫`;
  const m = DATA.mansions[b.xiu];
  return `${m.n}宿 入宿 ${b.rudu.toFixed(1)}°　${m.xiang}`;
}

/** 一颗星的合成句：行星给「哪份能力」，星座给「什么底色」，宫位给「哪块地方」。
    拆成三块拼，好处是读的人一眼看得出这句是怎么来的，不会当成秘传断语。 */
function compose(pn){
  const p = DATA.planets.find(x => x.n === pn), b = chart.bodies[pn];
  const s = DATA.signs[b.sign], h = DATA.houses[b.house];
  return plain
    ? `${key(p)}带着「${key(s)}」的底色，落在${key(h)}这一块。`
    : `主${key(p)}，值${s.n}，${key(s)}；居${h.n}，主${key(h)}。`;
}

function show(kind, k){
  let title = '', sub = '', body = '';
  if (kind === 'planet'){
    const p = DATA.planets.find(x => x.n === k), b = chart.bodies[k];
    if (mode === 'east'){
      // 中式读法：星在何宿、宿主何事、分野何国。跟西洋那套完全分开走。
      const m = DATA.mansions[b.xiu];
      title = label(p);
      sub = `${m.n}宿 入宿 ${b.rudu.toFixed(2)}°　${m.xiang}　分野 ${m.guo}·${m.zhou}`;
      body = (plain ? p.p : p.t)
        + `<br><br><b>所临之宿</b>：${m.n}宿，${m.zhan}`
        + `<br>此宿属${m.xiang}，分野在${m.guo}（${m.zhou}）。`
        + `<br><br><b>入宿度</b>：${b.rudu.toFixed(2)}° —— `
        + `中式定度自距星起算，宿度不等，此宿共 ${m.deg.toFixed(1)}°。`;
    } else {
      title = p.n; sub = p.g + (p.cn !== '—' ? '　中名 ' + p.cn : '');
      body = (plain ? p.p : p.t) + '<br><br>' + compose(k)
        + `<br><br><b>此盘</b>：${DATA.signs[b.sign].n}座 ${b.deg.toFixed(2)}°，`
        + `第 ${b.house + 1} 宫（${DATA.houses[b.house].n}）。`;
    }
  } else if (kind === 'sign'){
    const s = DATA.signs[k];
    title = s.n + '座'; sub = `${s.g}　${s.el}象 · ${s.q}宫　主星 ${s.r1}`;
    body = plain ? s.p : s.t;
  } else if (kind === 'house'){
    const h = DATA.houses[k];
    title = `第 ${k + 1} 宫`; sub = h.n;
    const inside = Object.entries(chart.bodies)
      .filter(([n, b]) => b.house === k && !['上升','天顶','南交点'].includes(n))
      .map(([n]) => n);
    body = (plain ? h.p : h.t)
         + (inside.length ? `<br><br><b>此盘落入</b>：${inside.join('、')}` : '');
  } else if (kind === 'asp'){
    const d = DATA.aspects.find(x => x.n === k.type);
    title = `${k.a} ${k.type} ${k.b}`;
    sub = `${d.a}° 相位　实际 ${k.exact.toFixed(2)}°　容许 ${k.orb.toFixed(2)}°`;
    body = plain ? d.p : d.t;
  } else if (kind === 'xiu'){
    const m = DATA.mansions[k];
    title = m.n + '宿';
    sub = `${m.xiang}　宿度 ${m.deg.toFixed(2)}°　分野 ${m.guo}·${m.zhou}`;
    const inside = Object.entries(chart.bodies)
      .filter(([n, b]) => b.xiu === k && !['上升','天顶'].includes(n))
      .map(([n, b]) => `${n}（入宿 ${b.rudu.toFixed(1)}°）`);
    body = m.zhan
         + `<br><br>二十八宿按赤道划分，宿度不等 —— 这一宿占 `
         + `${m.deg.toFixed(1)} 度（最宽的井宿 32.2°，最窄的觜宿 1.4°）。`
         + (inside.length ? `<br><br><b>此盘落入</b>：${inside.join('、')}`
                          : '<br><br>此盘无星落入。');
  } else if (kind === 'ci'){
    const c = DATA.ci[k];
    title = c.n; sub = `十二次　分野 ${c.fen}　含 ${c.xiu}宿`;
    body = DATA.lore['十二次'] + '<br><br>' + DATA.lore['分野'];
  } else if (kind === 'lore'){
    title = k; body = DATA.lore[k];
  }
  $('pn').textContent = title;
  $('pp').textContent = sub;
  $('pt').innerHTML = body;
  $('panel').classList.add('show');
  document.body.classList.add('open');
}

/* ── 解析 ───────────────────────────────────────
   写成一份报告，不是一次测试的结果。差别在三处：

   一、先摆天象，再摆读法。开头那一节全是从位置直接读出来的量 ——
       节气、月相、恒星时、儒略日 —— 谁拿去对都能对上。
       后面的传统说法由这些量引出，来路看得见。

   二、每一节标出处：【算】是天文，【传】是传统说法，
       【传·有定规】是传统里少数几条有固定对照表、能逐条核对的。

   三、能给依据的地方给依据。庙旺陷落写清「庙于何宫、此处为何宫的对宫」，
       相位写清实际夹角、容许度、以及入相还是出相。
       说法可以不信，但它是怎么来的应当摆在那里。 */

const hms = deg => {
  const h = deg / 15, m = (h % 1) * 60;
  return `${Math.floor(h)}h${String(Math.floor(m)).padStart(2, '0')}m`;
};

/** 庙旺陷落。四种状态由一张固定对照表定，不含判断。 */
function dignityOf(pn, signName){
  const d = DATA.dignity[pn];
  if (!d) return null;
  if (d['庙'].includes(signName)) return '庙';
  if (d['旺'][0] === signName) return '旺';
  if (d['陷'].includes(signName)) return '陷';
  if (d['落'] === signName) return '落';
  return '平';
}

/** 庙旺那一条的依据句 —— 说清这个结论是从表上哪一行来的。 */
function dignityWhy(pn, state){
  const d = DATA.dignity[pn];
  const home = d['庙'].join('、'), ex = `${d['旺'][0]} ${d['旺'][1]} 度`;
  const base = `${pn}庙于${home}，旺于${ex}。`;
  if (state === '庙') return base + '此处正是其庙。';
  if (state === '旺') return base + '此处正是其擢升之位。';
  if (state === '陷') return base + `${d['陷'].join('、')}是庙位的对宫，故为陷。`;
  if (state === '落') return base + `${d['落']}是旺位的对宫，故为落。`;
  return base + '此处既非庙旺，也非陷落。';
}

function lines(){
  const L = [];
  const B = chart.bodies, S = DATA.signs, M = DATA.mansions;
  const sName = n => S[B[n].sign].n;
  const SEVEN = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星'];
  const dg = o => plain ? o.p : o.t;

  // ── 一 · 天象。两种盘共用，因为这一节根本不涉及读法。 ──
  const sky = () => {
    L.push(['k', '一 · 出 生 时 的 天 象　【算】']);
    L.push(['n', '这一节全部是从行星位置直接读出的天文量，不含任何解释。'
                + '拿任何一份星历去对，数字应当对得上。']);
    L.push(['b',
      `太阳黄经 ${B['太阳'].lon.toFixed(2)}°　节气 ${chart.jieqi}　入节 ${chart.jieqiDeg.toFixed(2)}°`,
      '节气就是太阳黄经的刻度：每 15 度一个，春分定在 0 度。'
      + '它是天文量，不是历法上的约定 —— 所以中西两张盘用的是同一个太阳。']);
    L.push(['b',
      `月相 ${chart.phase}　月龄 ${chart.moonAge.toFixed(1)} 日　日月相距 ${chart.elong.toFixed(1)}°`,
      '月相看日月黄经差：0 度为朔，180 度为望。月龄由此换算，朔望月取 29.53 日。']);
    L.push(['b',
      `当地恒星时 ${hms(chart.ramc)}　黄赤交角 ${chart.eps.toFixed(4)}°`,
      '恒星时由儒略日与经度算出，上升点再由恒星时与纬度算出 —— '
      + '整张盘的骨架就是这两个数。交角随岁差缓慢变化，按出生时刻取值。']);
    L.push(['b',
      `儒略日 ${chart.jd.toFixed(4)}`,
      '天文学里连续计日的方式，跨历法不会算错。行星位置由它推出。']);
    L.push(['b',
      `参照点 ${chart.city}${chart.anchor !== chart.city ? ' · ' + chart.anchor : ''}　`
      + `${chart.lat >= 0 ? '北纬' : '南纬'} ${Math.abs(chart.lat).toFixed(2)}°　`
      + `${chart.lon >= 0 ? '东经' : '西经'} ${Math.abs(chart.lon).toFixed(2)}°`,
      '经度定恒星时，纬度定上升。'
      + (chart.anchor === chart.city
         ? '这个地点本身就是一个点，取值没有含糊。'
         : `${chart.city}是一片地方不是一个点，这里取的是${chart.anchor}的坐标 —— `
           + '换一个参照点，上升会跟着动。')]);
  };

  if (mode === 'west'){
    L.push(['h', '西 洋 盘']);
    L.push(['n', '位置是算的，读法是传统的。下面每一节都标出处：'
               + '【算】是天文，【传】是传统说法，【传·有定规】是传统里'
               + '有固定对照表、能逐条核对的那部分。']);
    sky();

    // ── 二 · 命主 ──
    const rb = B[chart.ruler];
    L.push(['k', '二 · 命 主　【传】']);
    L.push(['n', '古典盘从命主星读起：上升星座的传统主星，'
               + '在这套体系里代表「此人自己」。近代盘改用现代主星，这里用传统的。']);
    L.push(['b', `上升 ${sName('上升')} ${B['上升'].deg.toFixed(2)}°　命主星 ${chart.ruler}`,
            `${sName('上升')}座的传统主星是${chart.ruler}，故以${chart.ruler}为命主。`,
            ['planet', '上升']]);
    if (rb){
      const st = dignityOf(chart.ruler, sName(chart.ruler));
      L.push(['b',
        `命主星 ${chart.ruler} · ${sName(chart.ruler)} ${rb.deg.toFixed(2)}° · 第 ${rb.house + 1} 宫`
        + (st ? `　居${st}` : ''),
        compose(chart.ruler) + (st ? `　${dignityWhy(chart.ruler, st)}` : ''),
        ['planet', chart.ruler]]);
    }

    // ── 三 · 三要素 ──
    L.push(['k', '三 · 三 要 素　【传】']);
    for (const n of ['太阳', '月亮', '上升'])
      L.push(['b', `${n} · ${sName(n)} ${B[n].deg.toFixed(2)}°`
                 + (n !== '上升' ? ` · 第 ${B[n].house + 1} 宫` : ''),
              compose(n), ['planet', n]]);

    // ── 四 · 庙旺陷落 ──
    L.push(['k', '四 · 七 政 的 庙 旺 陷 落　【传·有定规】']);
    L.push(['n', '这是古典占星里少数几条有固定对照表的东西：'
               + '庙＝行星在自己的宫，旺＝在擢升之位，陷＝庙位的对宫，落＝旺位的对宫。'
               + '不含判断，谁来算都一样，可以逐条核对。']);
    for (const n of SEVEN){
      const st = dignityOf(n, sName(n));
      L.push(['b', `${n} · ${sName(n)} ${B[n].deg.toFixed(1)}°　居${st}`,
              dignityWhy(n, st) + '　' + dg(DATA.dignityRead[st]),
              ['planet', n]]);
    }

    // ── 五 · 气质分布 ──
    const cnt = { el: {}, q: {} };
    for (const p of DATA.planets){
      if (['上升', '天顶', '南交点', '北交点'].includes(p.n)) continue;
      const sg = S[B[p.n].sign];
      cnt.el[sg.el] = (cnt.el[sg.el] || 0) + 1;
      cnt.q[sg.q] = (cnt.q[sg.q] || 0) + 1;
    }
    const topEl = Object.entries(cnt.el).sort((a, b) => b[1] - a[1])[0];
    const topQ = Object.entries(cnt.q).sort((a, b) => b[1] - a[1])[0];
    L.push(['k', '五 · 气 质 分 布　【传】']);
    L.push(['n', '按十颗星（不含上升、天顶与交点）落在哪一象、哪一模式来数。'
               + '数得出来，但「多了会怎样」是说法。']);
    L.push(['b', '四象　' + ['火','土','风','水'].map(e => `${e} ${cnt.el[e] || 0}`).join('　'),
            dg(DATA.elem[topEl[0]])]);
    L.push(['b', '三模式　' + ['基本','固定','变动'].map(q => `${q} ${cnt.q[q] || 0}`).join('　'),
            dg(DATA.mode[topQ[0]])]);

    // ── 六 · 诸星所居 ──
    L.push(['k', '六 · 诸 星 所 居　【传】']);
    for (const p of DATA.planets){
      if (['太阳', '月亮', '上升', '天顶', '南交点'].includes(p.n)) continue;
      const b = B[p.n];
      L.push(['b',
        `${p.n} · ${sName(p.n)} ${b.deg.toFixed(1)}° · 第 ${b.house + 1} 宫（${DATA.houses[b.house].n}）`,
        compose(p.n), ['planet', p.n]]);
    }

    // ── 七 · 相位 ──
    if (chart.asp.length){
      L.push(['k', '七 · 相 位　【算 + 传】']);
      L.push(['n', '相位是两星黄经的夹角落在特定角度附近。「差」是实际夹角，'
                 + '「容许」是它离标准角度多远 —— 越小越紧。'
                 + '入相＝还在收紧，出相＝已经散开，由一小时后的盘对比得出。'
                 + '角度与松紧是算的，怎么解读是说法。']);
      for (const a of chart.asp.slice(0, 8)){
        const d = DATA.aspects.find(x => x.n === a.type);
        L.push(['b',
          `${a.a} ${a.type} ${a.b}　差 ${a.exact.toFixed(2)}°　容许 ${a.orb.toFixed(2)}°　${a.moving}`,
          `标准角 ${d.a}°。` + dg(d), ['asp', a]]);
      }
      if (chart.asp.length > 8)
        L.push(['n', `另有 ${chart.asp.length - 8} 条容许度更松的相位未列。`
                   + '按由紧到松排，越靠前越要紧。']);
    }

    /* ── 八 · 感情 ──────────────────────────────────────
       走的是通行的老路子：金星看被什么吸引、火星看怎么使劲、
       七宫与七宫主星看伴侣与从哪儿遇上、月亮看不设防时要什么。
       没写吉凶断语 —— 「主大富大贵」「必有一劫」那种不是传统里
       最好的部分，是最坏的部分。 */
    const src = h => dg(DATA.source[h + 1]);
    const vb = B['金星'], mb = B['火星'];
    L.push(['k', '八 · 感 情　【传】']);
    L.push(['n', '金星看你被什么吸引，火星看你怎么使劲，七宫与七宫主星看'
               + '伴侣的样子与从哪儿遇上，月亮看不设防的时候要什么。'
               + '下面每条都是「传统上认为」，说的是倾向，不是判决。']);
    L.push(['b', `金星 · ${sName('金星')} ${vb.deg.toFixed(1)}° · 第 ${vb.house + 1} 宫`,
            dg(DATA.venus[sName('金星')]) + `。落在${DATA.houses[vb.house].n}，`
            + `所以这份喜好多半绕着「${key(DATA.houses[vb.house])}」打转。`,
            ['planet', '金星']]);
    L.push(['b', `火星 · ${sName('火星')} ${mb.deg.toFixed(1)}° · 第 ${mb.house + 1} 宫`,
            dg(DATA.mars[sName('火星')]) + `。使劲的地方多在${DATA.houses[mb.house].n}。`,
            ['planet', '火星']]);
    {
      const rb2 = B[chart.h7.ruler];
      L.push(['b', `七宫头 ${chart.h7.sign}　宫主星 ${chart.h7.ruler}`
                 + (rb2 ? ` 落第 ${rb2.house + 1} 宫` : ''),
              `七宫是一对一关系那一宫，宫头落${chart.h7.sign}，`
              + `其传统主星${chart.h7.ruler}即为七宫主。`
              + (rb2 ? `它落在第 ${rb2.house + 1} 宫 —— 传统上看「从哪儿遇上」—— `
                       + src(rb2.house) + '。' : ''),
              rb2 ? ['planet', chart.h7.ruler] : null]);
    }
    L.push(['b', `月亮 · ${sName('月亮')} ${B['月亮'].deg.toFixed(1)}° · 第 ${B['月亮'].house + 1} 宫`,
            `不设防时要的东西：${key(S[B['月亮'].sign])}。`
            + `传统上月亮比太阳更能说明亲密关系里的实际相处。`,
            ['planet', '月亮']]);
    {
      const hits = chart.asp
        .filter(a => a.a === '金星' || a.b === '金星')
        .map(a => {
          const other = a.a === '金星' ? a.b : a.a;
          return { txt: DATA.venusAsp[`${other}|${a.type}`], a };
        })
        .filter(x => x.txt);
      if (hits.length)
        for (const h of hits)
          L.push(['b', `金星 ${h.a.type} ${h.a.a === '金星' ? h.a.b : h.a.a}　`
                     + `容许 ${h.a.orb.toFixed(2)}°　${h.a.moving}`,
                  h.txt + '。', ['asp', h.a]]);
      else
        L.push(['n', '金星与土星、天王星、火星之间没有构成主要相位 —— '
                   + '传统上这几组是看感情阻碍与吸引的主要着眼处，'
                   + '没有就是没有，不硬凑。']);
    }

    /* ── 九 · 事业与钱 ─────────────────────────────────── */
    L.push(['k', '九 · 事 业 与 钱　【传】']);
    L.push(['n', '天顶看别人从哪个方向认识你，十宫主星看机会从哪儿来，'
               + '太阳看想成为什么，土星看必须扛的那部分，二宫看钱。'
               + '天顶不是「你能干什么」，是「你被当成什么」。']);
    L.push(['b', `天顶 ${chart.mcSign} ${(chart.mc % 30).toFixed(1)}°`,
            dg(DATA.mc[chart.mcSign]) + '。',
            ['planet', '天顶']]);
    {
      const rb3 = B[chart.h10.ruler];
      L.push(['b', `十宫头 ${chart.h10.sign}　宫主星 ${chart.h10.ruler}`
                 + (rb3 ? ` 落第 ${rb3.house + 1} 宫` : ''),
              rb3 ? `事业的机会传统上看十宫主落在哪 —— ${src(rb3.house)}。`
                  : '十宫主星未在盘上。',
              rb3 ? ['planet', chart.h10.ruler] : null]);
    }
    L.push(['b', `太阳 · ${sName('太阳')} · 第 ${B['太阳'].house + 1} 宫（${DATA.houses[B['太阳'].house].n}）`,
            `想成为什么样的人：${key(S[B['太阳'].sign])}；`
            + `这件事主要在${DATA.houses[B['太阳'].house].n}那一块展开。`,
            ['planet', '太阳']]);
    {
      const sb = B['土星'], st = dignityOf('土星', sName('土星'));
      L.push(['b', `土星 · ${sName('土星')} · 第 ${sb.house + 1} 宫　居${st}`,
              `传统上土星所在的宫是「慢熟、要吃苦、但最后最结实」的那一块 ——`
              + `这里是${DATA.houses[sb.house].n}。${dg(DATA.dignityRead[st])}。`,
              ['planet', '土星']]);
    }
    {
      const jb = B['木星'];
      L.push(['b', `木星 · ${sName('木星')} · 第 ${jb.house + 1} 宫`,
              `传统上木星所在的宫是相对松、相对有余地的那一块 ——`
              + `这里是${DATA.houses[jb.house].n}。也容易在这块铺太大。`,
              ['planet', '木星']]);
    }
    {
      const rb4 = B[chart.h2.ruler];
      L.push(['b', `二宫头 ${chart.h2.sign}　宫主星 ${chart.h2.ruler}`
                 + (rb4 ? ` 落第 ${rb4.house + 1} 宫` : ''),
              rb4 ? `二宫主钱与自有资源。宫主星落第 ${rb4.house + 1} 宫 —— ${src(rb4.house)}。`
                  : '二宫主星未在盘上。',
              rb4 ? ['planet', chart.h2.ruler] : null]);
    }

    /* ── 十 · 时机 ─────────────────────────────────────── */
    const ymd = d => `${d.getUTCFullYear()} 年 ${d.getUTCMonth() + 1} 月`;
    const age = d => d.getUTCFullYear() - pick.y;
    const nowY = chart.now.date.getUTCFullYear();
    L.push(['k', '十 · 时 机　【算 + 传】']);
    L.push(['n', '这一节的年份是算出来的：把行星推到它回到出生黄经的那一刻，'
               + '用平均周期估，再迭代收敛。说法才是传统的。'
               + '解法是粗扫加二分，误差在千分之一度以内。'
               + '行星逆行时会来回几次经过本命位置，前后能拖一年 —— '
               + '那是真实现象，所以下面写的是一段时间，不是一个日子。']);
    const spell = arr => !arr.length ? '未落在可算范围内'
      : arr.length === 1 ? ymd(arr[0])
      : `${ymd(arr[0])} 至 ${ymd(arr[arr.length - 1])}`;
    const passNote = arr => arr.length > 1
      ? `　该段内共 ${arr.length} 次经过本命位置 —— 逆行所致，不是笔误。` : '';
    L.push(['b', `土星回归（第一次）　${spell(chart.saturnReturn[0])}`
               + (chart.saturnReturn[0].length ? `　那年约 ${age(chart.saturnReturn[0][0])} 岁` : ''),
            dg(DATA.cycle['土星回归一']) + passNote(chart.saturnReturn[0])]);
    L.push(['b', `土星回归（第二次）　${spell(chart.saturnReturn[1])}`
               + (chart.saturnReturn[1].length ? `　那年约 ${age(chart.saturnReturn[1][0])} 岁` : ''),
            dg(DATA.cycle['土星回归二']) + passNote(chart.saturnReturn[1])]);
    {
      const flat = chart.jupiterReturns.filter(a => a.length);
      const next = flat.find(a => a[0].getUTCFullYear() >= nowY) || flat[flat.length - 1];
      L.push(['b', `木星回归　下一次 ${spell(next)}　那年约 ${age(next[0])} 岁`,
              dg(DATA.cycle['木星回归']) + passNote(next)
              + `　历次在 ${flat.map(a => a[0].getUTCFullYear()).join('、')} 年。`]);
    }
    for (const t of chart.transit)
      L.push(['b', `今日行运　${t.n}在${t.sign} ${(t.lon % 30).toFixed(1)}°　`
                 + `走到你的第 ${t.house + 1} 宫（${DATA.houses[t.house].n}）`,
              DATA.transitHouse[t.n]
              + `此刻落在${DATA.houses[t.house].n}，`
              + `也就是「${key(DATA.houses[t.house])}」那一块。`]);
    L.push(['n', `行运位置按 ${chart.now.date.getUTCFullYear()} 年 `
               + `${chart.now.date.getUTCMonth() + 1} 月 ${chart.now.date.getUTCDate()} 日算，`
               + '每次打开这一页都会重算。只列木星与土星 —— '
               + '快的行星一年跑好几圈，说了等于没说。']);
  } else {
    L.push(['h', '中 式 盘 · 七 政 四 余']);
    L.push(['n', '同一批行星，换一套坐标：西洋按黄道分十二宫（等分 30 度），'
               + '这里按赤道分二十八宿（宿度不等，井 32.2 度、觜 1.4 度）。'
               + '中国星占的落点在「主何事」，不在性格 —— 底下的占辞都是这个路子。']);
    sky();

    const am = M[B['上升'].xiu];
    const sunXiu = M[B['太阳'].xiu];
    L.push(['b', `太阳所临 ${sunXiu.n}宿 入宿 ${B['太阳'].rudu.toFixed(2)}°`,
            `赤经 ${B['太阳'].ra.toFixed(2)}°。二十八宿按赤道划分，自距星起算入宿度 —— `
            + '与上面那个黄经是两套坐标下的同一个太阳。',
            ['xiu', B['太阳'].xiu]]);

    L.push(['k', '二 · 命 宫 所 临　【传】']);
    L.push(['n', '中式盘不设十二宫，改看上升点落在二十八宿的哪一宿。'
               + '宿度不等，所以「入宿几度」比「几宫几度」更要紧。']);
    L.push(['b', `命宫在${am.n}宿　入宿 ${B['上升'].rudu.toFixed(2)}°　宿广 ${am.deg.toFixed(1)}°`,
            `${am.n}宿属${am.xiang}，分野在${am.guo}（${am.zhou}）。${am.zhan}`,
            ['xiu', B['上升'].xiu]]);

    L.push(['k', '三 · 七 政 所 临　【传】']);
    L.push(['n', '七政即日月五星。每一条给出所临之宿、入宿度、该宿主何事、'
               + '以及分野配到地上的哪一国哪一州。占辞出自《史记·天官书》'
               + '《晋书·天文志》一路的旧说。']);
    for (const n of SEVEN){
      const b = B[n], m = M[b.xiu];
      const pl = DATA.planets.find(x => x.n === n);
      L.push(['b', `${pl.cn}（${n}）在${m.n}宿 ${b.rudu.toFixed(2)}°　${m.xiang}`,
              `${m.zhan}　分野 ${m.guo}·${m.zhou}。`
              + `此宿广 ${m.deg.toFixed(1)}°，距星赤经 ${m.ra.toFixed(1)}°。`,
              ['planet', n]]);
    }

    L.push(['k', '四 · 四 余 之 二　【传】']);
    L.push(['n', '四余为罗睺、计都、月孛、紫气。前二者即黄白交点，是算得出来的实点；'
               + '后二者古法各家不一，这里不列 —— 拿不准的宁可留白。']);
    for (const n of ['北交点', '南交点']){
      const b = B[n], m = M[b.xiu];
      const pl = DATA.planets.find(x => x.n === n);
      L.push(['b', `${pl.cn}（${n}）在${m.n}宿 ${b.rudu.toFixed(2)}°`,
              (plain ? pl.p : pl.t) + `　所临${m.n}宿，${m.zhan}`, ['planet', n]]);
    }

    const xc = {}, gs = {};
    for (const n of SEVEN){
      const m = M[B[n].xiu];
      xc[m.xiang] = (xc[m.xiang] || 0) + 1;
      gs[m.guo] = (gs[m.guo] || 0) + 1;
    }
    const top = Object.entries(xc).sort((a, b) => b[1] - a[1])[0];
    L.push(['k', '五 · 四 象 与 分 野　【传】']);
    L.push(['b', '四象　' + Object.entries(xc).map(([k, v]) => `${k} ${v}`).join('　'),
            `七政以${top[0]}为多。四象各主一方一季 —— `
            + '苍龙主春，朱雀主夏，白虎主秋，玄武主冬。']);
    L.push(['b', '分野　' + Object.entries(gs).sort((a, b) => b[1] - a[1])
                   .map(([k, v]) => `${k} ${v}`).join('　'),
            '分野是把天上的宿配到地上的国州。它本来是给王朝看的 —— '
            + '某宿有异，应在某地，从来不是给个人算的。这里当一层地理注脚看。']);
  }

  L.push(['f', mode === 'west'
    ? '天象那一节是算的，可以拿任何星历核对。庙旺陷落有固定对照表，'
      + '相位的角度与松紧是算的 —— 这些都能查。至于「居陷力弱」「冲则拉扯」'
      + '这类话，是两千年传统里的说法，不是事实判断。两者在上面分开标着，'
      + '信到哪一层由你定。'
    : '天象与入宿度是算的，二十八宿的宿度由距星实测赤经得出。'
      + '占辞与分野是《天官书》一路的旧说 —— 那套东西本是给王朝占的，'
      + '落到个人头上属于后世的挪用。当文化读，别当预测。']);
  return L;
}

/** 逐条浮现。重排时用 token 作废上一轮，免得两批动画叠在一起。 */
async function runReading(){
  const box = $('read');
  const my = ++revealToken;
  box.innerHTML = '';
  const L = lines();
  /* 节奏按总条数分摊。原来是每条固定 140ms —— 那时报告只有二十几条，
     三秒出完。补上感情、事业、时机之后涨到八十条，同样的节奏要拖十几秒，
     等成了折磨。改成总时长封顶约六秒，条数越多每条越快。 */
  const step = Math.max(35, Math.min(140, 6000 / L.length));
  for (const [kind, a, b, tap] of L){
    if (my !== revealToken) return;              // 已被新的一轮顶掉
    const row = document.createElement('div');
    row.className = 'rl ' + kind + (tap ? ' tapable' : '');
    row.innerHTML = kind === 'b'
      ? `<div class="rt">${a}</div><div class="rb">${b}</div>`
      : a;
    // 手机上盘上那些点太小按不中，条目本身就是入口
    if (tap) row.addEventListener('click', () => show(tap[0], tap[1]));
    box.appendChild(row);
    // 强制回流让初始状态落定，再加 .in ——
    // 不能用 requestAnimationFrame：标签页在后台时它根本不触发，
    // 那样整栏会永远停在 opacity 0，切回来是一片空白。
    void row.offsetWidth;
    row.classList.add('in');
    await wait(kind === 'h' ? step * 2.2 : kind === 'k' ? step * 1.6 : step);
  }
}

/* ── 悬停卡与面板 ───────────────────────────── */
function card(e, t, s){
  const c = $('card');
  c.innerHTML = `<div class="cn">${t}</div><div class="cb">${s}</div>`;
  c.classList.add('on');
  const w = c.offsetWidth || 240;
  c.style.left = Math.min(Math.max(e.clientX, w/2 + 8), innerWidth - w/2 - 8) + 'px';
  c.style.top = Math.max(c.offsetHeight + 16, e.clientY) + 'px';
}
const hideCard = () => $('card').classList.remove('on');

function closePanel(){
  $('panel').classList.remove('show');
  document.body.classList.remove('open');
}

/* ── 装配 ───────────────────────────────────── */
export function mount(){
  const sel = $('bcity');
  PLACES.forEach((pl, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = placeLabel(pl);   // 参照点写进选项，用的是哪个点得让人看见
    sel.appendChild(o);
  });
  sel.value = PLACES.length - 1;                     // 默认德国
  $('bh').value = 12; $('bmin').value = 0;
  calendar();

  const box = $('secs');
  const mk = (title, keys) => {
    const sec = document.createElement('div');
    sec.className = 'railsec';
    const h = document.createElement('h3'); h.textContent = title;
    const b = document.createElement('div'); b.className = 'chips';
    for (const k of keys){
      const c = document.createElement('div');
      c.className = 'chip'; c.textContent = k;
      c.addEventListener('click', () => show('lore', k));
      b.appendChild(c);
    }
    sec.append(h, b); return sec;
  };

  fetch('astrodata.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    DATA = d;
    box.append(
      mk('西 洋 占 星', ['黄道十二宫', '岁差', '上升点', '宫位制', '相位']),
      mk('中 国 星 命', ['七政四余', '二十八宿', '十二次', '分野',
                         '紫微斗数', '荧惑守心', '岁星纪年']));
    cast();
  });

  $('cast').addEventListener('click', () => {
    cast();
    // 手机上表单是盖住盘面的抽屉。排完盘还挡着的话，
    // 用户看不到自己刚算出来的东西 —— 算完就让开。
    if (narrow.matches) document.body.classList.add('rail-off');
  });
  $('close').addEventListener('click', closePanel);
  $('back').addEventListener('click', closePanel);
  addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  $('plain').textContent = plain ? '说 人 话' : '术 语';
  $('plain').classList.toggle('on', plain);
  $('plain').addEventListener('click', () => {
    plain = !plain;
    $('plain').textContent = plain ? '说 人 话' : '术 语';
    $('plain').classList.toggle('on', plain);
    if (chart) runReading();
  });
  document.querySelectorAll('.seg button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      mode = b.dataset.m;
      closePanel(); draw(); runReading();
    });
  });
  $('hsys').addEventListener('change', () => { hsys = $('hsys').value; cast(); });
  $('railtoggle').addEventListener('click',
    () => document.body.classList.toggle('rail-off'));
  $('readtoggle').addEventListener('click',
    () => document.body.classList.toggle('read-off'));

  /* 手机：出生表单默认收起，先让人看见盘和解析；
     解析栏留着展开 —— 它才是这页的内容，藏起来等于白算。 */
  if (narrow.matches) document.body.classList.add('rail-off');

  /* 触摸设备没有 mouseleave，悬停卡出来了收不回去。同星图那边的处理。 */
  if (matchMedia('(hover: none)').matches){
    document.addEventListener('click', e => {
      if (e.target === document.body && !document.body.classList.contains('rail-off')){
        document.body.classList.add('rail-off');
        return;
      }
      if (!e.target.closest('#card,#wheel .body,#wheel .sec,#wheel .asp')) hideCard();
    });
  }

  const srcBox = $('src');
  $('srcbtn').addEventListener('click', () => srcBox.classList.add('on'));
  $('srcclose').addEventListener('click', () => srcBox.classList.remove('on'));
  srcBox.addEventListener('click', e => {
    if (e.target === srcBox) srcBox.classList.remove('on');
  });
}
