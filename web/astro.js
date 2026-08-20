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

const NS = 'http://www.w3.org/2000/svg';
const R = 340;
const $ = id => document.getElementById(id);
const norm = a => ((a % 360) + 360) % 360;
const wait = ms => new Promise(r => setTimeout(r, ms));

let DATA, chart = null, mode = 'west', plain = false, hsys = 'whole';
let pick = { y: 2000, m: 1, d: 1 };            // 默认停在 2000-01-01
let calY = 2000, calM = 1;
let revealToken = 0;
const narrow = matchMedia('(max-width: 820px)');

/* 内置城市表。不用第三方地理编码 —— 出生地点是个人数据，
   没有理由为了查经纬度把它送出去。时区为标准时，夏令时另勾。 */
const CITIES = [
  ['北京', 39.90, 116.41, 8], ['上海', 31.23, 121.47, 8],
  ['广州', 23.13, 113.26, 8], ['深圳', 22.54, 114.06, 8],
  ['成都', 30.57, 104.07, 8], ['西安', 34.34, 108.94, 8],
  ['武汉', 30.59, 114.31, 8], ['杭州', 30.27, 120.15, 8],
  ['南京', 32.06, 118.80, 8], ['哈尔滨', 45.80, 126.53, 8],
  ['乌鲁木齐', 43.83, 87.62, 8], ['香港', 22.32, 114.17, 8],
  ['台北', 25.03, 121.57, 8], ['东京', 35.68, 139.69, 9],
  ['首尔', 37.57, 126.98, 9], ['新加坡', 1.35, 103.82, 8],
  ['柏林', 52.52, 13.40, 1], ['慕尼黑', 48.14, 11.58, 1],
  ['伦敦', 51.51, -0.13, 0], ['巴黎', 48.86, 2.35, 1],
  ['阿姆斯特丹', 52.37, 4.90, 1], ['苏黎世', 47.38, 8.54, 1],
  ['纽约', 40.71, -74.01, -5], ['旧金山', 37.77, -122.42, -8],
  ['多伦多', 43.65, -79.38, -5], ['悉尼', -33.87, 151.21, 10],
];

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
  const [, lat, lon, tz] = CITIES[ci];

  const c = compute(pick.y, pick.m, pick.d, hh + mm / 60, tz + dst, lat, lon);
  c.city = CITIES[ci][0];
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
  chart = c;
  draw();
  $('stamp').textContent =
    `${pick.y}-${String(pick.m).padStart(2,'0')}-${String(pick.d).padStart(2,'0')} `
    + `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} · ${c.city}`;
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

/* ── 解析：排成一条一条 ─────────────────────────
   两种模式各出各的，不共用句子 —— 中式盘的落点在「主何事」，
   西洋盘的落点在「是个什么人」，混着写两边都不像。 */
function lines(){
  const L = [];
  const B = chart.bodies, S = DATA.signs, M = DATA.mansions;
  const sName = n => S[B[n].sign].n;
  const SEVEN = ['太阳', '月亮', '水星', '金星', '火星', '木星', '土星'];

  if (mode === 'west'){
    L.push(['h', '西 洋 盘 · 传 统 读 法']);
    L.push(['k', '三 要 素']);
    for (const n of ['太阳', '月亮', '上升'])
      L.push(['b', `${n} · ${sName(n)}座 ${B[n].deg.toFixed(1)}°`, compose(n),
              ['planet', n]]);

    const cnt = { el: {}, q: {} };
    for (const p of DATA.planets){
      if (['上升', '天顶', '南交点', '北交点'].includes(p.n)) continue;
      const s = S[B[p.n].sign];
      cnt.el[s.el] = (cnt.el[s.el] || 0) + 1;
      cnt.q[s.q] = (cnt.q[s.q] || 0) + 1;
    }
    const topEl = Object.entries(cnt.el).sort((a, b) => b[1] - a[1])[0];
    const topQ = Object.entries(cnt.q).sort((a, b) => b[1] - a[1])[0];
    L.push(['k', '气 质 分 布']);
    L.push(['b', '四象　' + ['火','土','风','水']
              .map(e => `${e} ${cnt.el[e] || 0}`).join('　'),
            plain ? DATA.elem[topEl[0]].p : DATA.elem[topEl[0]].t]);
    L.push(['b', '三模式　' + ['基本','固定','变动']
              .map(q => `${q} ${cnt.q[q] || 0}`).join('　'),
            plain ? DATA.mode[topQ[0]].p : DATA.mode[topQ[0]].t]);

    L.push(['k', '诸 星 所 居']);
    for (const p of DATA.planets){
      if (['太阳', '月亮', '上升', '天顶', '南交点'].includes(p.n)) continue;
      const b = B[p.n];
      L.push(['b',
        `${p.n} · ${sName(p.n)}座 ${b.deg.toFixed(1)}° · 第 ${b.house + 1} 宫`,
        compose(p.n), ['planet', p.n]]);
    }
    if (chart.asp.length){
      L.push(['k', '主 要 相 位']);
      for (const a of chart.asp.slice(0, 6)){
        const d = DATA.aspects.find(x => x.n === a.type);
        L.push(['b', `${a.a} ${a.type} ${a.b}　相差 ${a.exact.toFixed(1)}°`,
                plain ? d.p : d.t, ['asp', a]]);
      }
    }
  } else {
    L.push(['h', '中 式 盘 · 七 政 四 余']);
    const am = M[B['上升'].xiu];
    L.push(['k', '命 宫 所 临']);
    L.push(['b', `命宫在${am.n}宿　入宿 ${B['上升'].rudu.toFixed(1)}°`,
            `${am.n}宿属${am.xiang}，分野在${am.guo}（${am.zhou}）。${am.zhan}`,
            ['xiu', B['上升'].xiu]]);

    L.push(['k', '七 政 所 临']);
    for (const n of SEVEN){
      const b = B[n], m = M[b.xiu];
      const p = DATA.planets.find(x => x.n === n);
      L.push(['b', `${p.cn}（${n}）在${m.n}宿 ${b.rudu.toFixed(1)}°`,
              `${m.zhan}　分野 ${m.guo}·${m.zhou}`, ['planet', n]]);
    }

    L.push(['k', '四 余 之 二']);
    for (const n of ['北交点', '南交点']){
      const b = B[n], m = M[b.xiu];
      const p = DATA.planets.find(x => x.n === n);
      L.push(['b', `${p.cn}（${n}）在${m.n}宿 ${b.rudu.toFixed(1)}°`,
              (plain ? p.p : p.t) + `　所临${m.n}宿，${m.zhan}`, ['planet', n]]);
    }

    const xc = {};
    for (const n of SEVEN)
      xc[M[B[n].xiu].xiang] = (xc[M[B[n].xiu].xiang] || 0) + 1;
    const top = Object.entries(xc).sort((a, b) => b[1] - a[1])[0];
    L.push(['k', '四 象 分 布']);
    L.push(['b', Object.entries(xc).map(([k, v]) => `${k} ${v}`).join('　'),
            `七政以${top[0]}为多。四象各主一方一季 —— `
            + '苍龙主春，朱雀主夏，白虎主秋，玄武主冬。']);

    const gs = {};
    for (const n of SEVEN)
      gs[M[B[n].xiu].guo] = (gs[M[B[n].xiu].guo] || 0) + 1;
    L.push(['k', '分 野 所 聚']);
    L.push(['b', Object.entries(gs).sort((a, b) => b[1] - a[1])
                   .map(([k, v]) => `${k} ${v}`).join('　'),
            '分野是把天上的宿配到地上的国州。它本来是给王朝看的 —— '
            + '某宿有异，应在某地，不是给个人算的。这里当一层地理注脚看。']);
  }
  L.push(['f', mode === 'west'
    ? '以上按西洋传统读法排出。位置是算的，读法是传统的 —— 两者不是一回事。'
    : '以上按七政四余的路子排出。中国星占的落点在「主何事」，不在性格。']);
  return L;
}

/** 逐条浮现。重排时用 token 作废上一轮，免得两批动画叠在一起。 */
async function runReading(){
  const box = $('read');
  const my = ++revealToken;
  box.innerHTML = '';
  for (const [kind, a, b, tap] of lines()){
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
    await wait(kind === 'h' ? 300 : kind === 'k' ? 220 : 140);
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
  CITIES.forEach(([n], i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = n; sel.appendChild(o);
  });
  sel.value = 16;                                    // 默认柏林
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
