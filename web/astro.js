/* 星盘：排盘与解读。
 *
 * 立场写在页面上，这里再说一遍：行星位置是真算的（ephem.js，天文），
 * 怎么解读是传统的说法（astrodata.json，文化）。两者在界面上分开标注。
 *
 * 有意思的结构：同一批行星，西洋按黄道分十二宫（等分 30 度），
 * 中国七政四余按赤道分二十八宿（宿度不等，井宿 32 度、觜宿 1.4 度）。
 * 换一次坐标系，整张盘重排 —— 跟星图那边「同一批星，两种划法」是一回事。
 *
 * 出生数据只在浏览器里算，不发往任何服务器。
 */
import { compute, houses, houseOf, aspects } from './ephem.js?v=8c8e7925';

const NS = 'http://www.w3.org/2000/svg';
const R = 340;
const $ = id => document.getElementById(id);
const norm = a => ((a % 360) + 360) % 360;

let DATA, chart = null, mode = 'west', plain = false, hsys = 'whole';

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

/* ── 排盘 ───────────────────────────────────── */
function cast(){
  const y = +$('by').value, mo = +$('bm').value, d = +$('bd').value;
  const hh = +$('bh').value, mm = +$('bmin').value;
  const ci = +$('bcity').value;
  const dst = $('bdst').checked ? 1 : 0;
  const [, lat, lon, tz] = CITIES[ci];

  const c = compute(y, mo, d, hh + mm / 60, tz + dst, lat, lon);
  c.city = CITIES[ci][0];
  c.cusp = houses(hsys, c.asc, c.mc);
  const names = DATA.planets.map(p => p.n)
    .filter(n => n !== '上升' && n !== '天顶' && n !== '南交点');
  c.asp = aspects(c.bodies, DATA.aspects, names);

  // 中式：按赤经定宿。角宿是二十八宿之首，摆在盘的左边。
  c.xiuStart = DATA.mansions.find(m => m.n === '角').ra;
  for (const [n, b] of Object.entries(c.bodies)){
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
    `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')} `
    + `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} · ${c.city}`;
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
      const a0 = off(i * 30), a1 = off(i * 30 + 30);
      const p = el('path', { d: arcPath(a0, a1, inner, outer) },
                   `sec el-${s.el}`);
      p.addEventListener('click', () => show('sign', i));
      p.addEventListener('mousemove', e => card(e, s.n + '座', plain ? s.p : s.t));
      p.addEventListener('mouseleave', hideCard);
      gRing.appendChild(p);
      const [tx, ty] = pos(off(i * 30 + 15), (inner + outer) / 2);
      const g = el('text', { x: tx, y: ty + 7 }, 'glyph');
      g.textContent = s.g; gRing.appendChild(g);
    });
    // 宫位辐条
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
    // 相位线
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
      const a0 = off(m.ra), a1 = off(m.ra + m.deg);
      const p = el('path', { d: arcPath(a0, a1, inner, outer) },
                   'sec xiu-' + (i % 4));
      p.addEventListener('click', () => show('xiu', i));
      p.addEventListener('mousemove', e => card(e, m.n + '宿',
        `宿度 ${m.deg.toFixed(1)}°　距星赤经 ${m.ra.toFixed(1)}°`));
      p.addEventListener('mouseleave', hideCard);
      gRing.appendChild(p);
      const [tx, ty] = pos(off(m.ra + m.deg / 2), (inner + outer) / 2);
      const t = el('text', { x: tx, y: ty + 5 }, 'xname');
      t.textContent = m.n; gRing.appendChild(t);
    });
    // 十二次
    DATA.ci.forEach((c, i) => {
      const a0 = off(chart.xiuStart + i * 30), a1 = off(chart.xiuStart + i * 30 + 30);
      const p = el('path', { d: arcPath(a0, a1, hRing, inner - 6) }, 'ci');
      p.addEventListener('click', () => show('ci', i));
      gRing.appendChild(p);
      const [tx, ty] = pos(off(chart.xiuStart + i * 30 + 15), (hRing + inner) / 2);
      const t = el('text', { x: tx, y: ty + 4 }, 'cname');
      t.textContent = c.n; gRing.appendChild(t);
    });
  }

  // 行星
  const placed = [];
  for (const p of DATA.planets){
    const b = chart.bodies[p.n];
    if (!b) continue;
    if (mode === 'east' && (p.n === '上升' || p.n === '天顶')) continue;
    let a = off(mode === 'west' ? b.lon : b.ra);
    while (placed.some(q => Math.abs(norm(a - q) > 180 ? 360 - norm(a - q)
                                                       : norm(a - q)) < 6.5))
      a = norm(a + 6.5);                       // 挤在一起时错开，免得叠成一坨
    placed.push(a);
    const [x, y] = pos(a, ringP);
    const g = el('g', {}, 'body');
    g.appendChild(el('circle', { cx: x, cy: y, r: 15 }, 'bdot'));
    const t = el('text', { x, y: y + 7 }, 'bglyph');
    t.textContent = p.g;
    g.appendChild(t);
    const [lx, ly] = pos(a, ringP - 30);
    const d = el('text', { x: lx, y: ly + 4 }, 'bdeg');
    d.textContent = mode === 'west'
      ? `${b.deg.toFixed(0)}°` : `${b.rudu.toFixed(0)}°`;
    g.appendChild(d);
    g.addEventListener('click', () => show('planet', p.n));
    g.addEventListener('mousemove', e => card(e, p.n, brief(p.n)));
    g.addEventListener('mouseleave', hideCard);
    gBody.appendChild(g);
  }

  // 中心圈与上升标记
  gRing.appendChild(el('circle', { r: hRing }, 'gui'));
  gRing.appendChild(el('circle', { r: inner }, 'gui'));
  gRing.appendChild(el('circle', { r: outer }, 'gui'));
  if (mode === 'west'){
    const [ax, ay] = pos(0, outer + 22);
    const t = el('text', { x: ax, y: ay + 5 }, 'mark');
    t.textContent = '上升'; gRing.appendChild(t);
    const [mx, my] = pos(off(chart.mc), outer + 22);
    const t2 = el('text', { x: mx, y: my + 5 }, 'mark');
    t2.textContent = '天顶'; gRing.appendChild(t2);
  }
}

/* ── 文案 ───────────────────────────────────── */
const SIGNS = () => DATA.signs.map(s => s.n);

function brief(name){
  const b = chart.bodies[name];
  if (!b) return '';
  if (mode === 'west')
    return `${DATA.signs[b.sign].n}座 ${b.deg.toFixed(1)}°　第 ${b.house + 1} 宫`;
  const m = DATA.mansions[b.xiu];
  return `${m.n}宿 入宿 ${b.rudu.toFixed(1)}°`;
}

function show(kind, key){
  const P = $('panel');
  let title = '', sub = '', body = '';
  if (kind === 'planet'){
    const p = DATA.planets.find(x => x.n === key), b = chart.bodies[key];
    title = p.n; sub = p.g + (p.cn !== '—' ? '　中名 ' + p.cn : '');
    body = (plain ? p.p : p.t) + '<br><br>'
         + `<b>此盘</b>：${DATA.signs[b.sign].n}座 ${b.deg.toFixed(2)}°，`
         + `第 ${b.house + 1} 宫（${DATA.houses[b.house].n}）；`
         + `赤经落在 ${DATA.mansions[b.xiu].n}宿，入宿 ${b.rudu.toFixed(2)}°。`;
  } else if (kind === 'sign'){
    const s = DATA.signs[key];
    title = s.n + '座'; sub = `${s.g}　${s.el}象 · ${s.q}宫　主星 ${s.r1}`;
    body = plain ? s.p : s.t;
  } else if (kind === 'house'){
    const h = DATA.houses[key];
    title = `第 ${key + 1} 宫`; sub = h.n;
    const inside = Object.entries(chart.bodies)
      .filter(([n, b]) => b.house === key && !['上升','天顶','南交点'].includes(n))
      .map(([n]) => n);
    body = (plain ? h.p : h.t)
         + (inside.length ? `<br><br><b>此盘落入</b>：${inside.join('、')}` : '');
  } else if (kind === 'asp'){
    const d = DATA.aspects.find(x => x.n === key.type);
    title = `${key.a} ${key.type} ${key.b}`;
    sub = `${d.a}° 相位　实际 ${key.exact.toFixed(2)}°　容许 ${key.orb.toFixed(2)}°`;
    body = plain ? d.p : d.t;
  } else if (kind === 'xiu'){
    const m = DATA.mansions[key];
    title = m.n + '宿'; sub = `宿度 ${m.deg.toFixed(2)}°　距星赤经 ${m.ra.toFixed(2)}°`;
    const inside = Object.entries(chart.bodies)
      .filter(([n, b]) => b.xiu === key && !['上升','天顶'].includes(n))
      .map(([n, b]) => `${n}（入宿 ${b.rudu.toFixed(1)}°）`);
    body = `二十八宿按赤道划分，宿度不等 —— 这一宿占 ${m.deg.toFixed(1)} 度。`
         + (inside.length ? `<br><br><b>此盘落入</b>：${inside.join('、')}`
                          : '<br><br>此盘无星落入。');
  } else if (kind === 'ci'){
    const c = DATA.ci[key];
    title = c.n; sub = `十二次　分野 ${c.fen}　含 ${c.xiu}宿`;
    body = DATA.lore['十二次'] + '<br><br>' + DATA.lore['分野'];
  } else if (kind === 'lore'){
    title = key; sub = ''; body = DATA.lore[key];
  }
  $('pn').textContent = title;
  $('pp').textContent = sub;
  $('pt').innerHTML = body;
  P.classList.add('show');
  document.body.classList.add('open');
}

const cardEl = () => $('card');
function card(e, t, s){
  const c = cardEl();
  c.innerHTML = `<div class="cn">${t}</div><div class="cb">${s}</div>`;
  c.classList.add('on');
  const w = c.offsetWidth || 240;
  c.style.left = Math.min(Math.max(e.clientX, w / 2 + 8), innerWidth - w / 2 - 8) + 'px';
  c.style.top = Math.max(c.offsetHeight + 16, e.clientY) + 'px';
}
const hideCard = () => cardEl().classList.remove('on');

function closePanel(){
  $('panel').classList.remove('show');
  document.body.classList.remove('open');
}

/* ── 装配 ───────────────────────────────────── */
function fillForm(){
  const sel = $('bcity');
  CITIES.forEach(([n], i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = n; sel.appendChild(o);
  });
  sel.value = 16;                                   // 默认柏林
  const now = new Date();
  $('by').value = 1990; $('bm').value = 6; $('bd').value = 15;
  $('bh').value = 12; $('bmin').value = 0;
}

function railLinks(){
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
  box.append(
    mk('西 洋 占 星', ['黄道十二宫', '岁差', '上升点', '宫位制', '相位']),
    mk('中 国 星 命', ['七政四余', '二十八宿', '十二次', '分野',
                       '紫微斗数', '荧惑守心', '岁星纪年']));
}

export function mount(){
  fetch('astrodata.json', { cache: 'no-cache' }).then(r => r.json()).then(d => {
    DATA = d;
    fillForm();
    railLinks();
    cast();
  });

  $('cast').addEventListener('click', cast);
  $('close').addEventListener('click', closePanel);
  $('back').addEventListener('click', closePanel);
  addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  $('plain').addEventListener('click', () => {
    plain = !plain;
    $('plain').textContent = plain ? '说 人 话' : '术 语';
    $('plain').classList.toggle('on', plain);
  });
  document.querySelectorAll('.seg button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      mode = b.dataset.m;
      closePanel(); draw();
    });
  });
  $('hsys').addEventListener('change', () => { hsys = $('hsys').value; cast(); });

  const srcBox = $('src');
  $('srcbtn').addEventListener('click', () => srcBox.classList.add('on'));
  $('srcclose').addEventListener('click', () => srcBox.classList.remove('on'));
  srcBox.addEventListener('click', e => {
    if (e.target === srcBox) srcBox.classList.remove('on');
  });
}
