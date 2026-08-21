/* 星图渲染引擎。
 *
 * 一份数据集喂不出正确的抽象 —— 这里的每一个配置口子，都来自
 * 「把星图复制一份改成概念星图」时真的卡住的地方，不是设想出来的。
 * 两份页面当时 87% 的行相同，剩下的 38 处改动就是下面的 CFG。
 *
 * 引擎不管布局：它只认「一个点有 [x, y]」。星图的坐标来自北极方位等距
 * 投影，概念图的来自极坐标排布，都是调用方算好再喂进来。一旦引擎自己
 * 管布局，它就变成了另一个图布局库，而布局质量是研究问题不是产品问题。
 *
 * CFG 需要给的东西见 sky.config.js / concept.config.js，两边对照着看最清楚。
 */
export function mount(CFG){
  // 图面半径由配置给。它本来就是配置该管的量（星图的投影要用它算），
  // 从引擎导出会让配置反向 import 引擎 —— 加版本戳时那会把引擎加载两遍。
  const R = CFG.R || 380;

const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('sky');
const tip = document.getElementById('tip');
const card = document.getElementById('card');

// 档位（星图是城市纬度，概念图是难度档）由配置给。

// 讲解在 skydata.json 的 lore 字段里，源文件 data/lore_cn.json。


let DATA, culture = CFG.culture, site = CFG.tier, sel = null;
let CUL = null, NODEOF = null;   // 当前 culture 与 hip->节点表，供全局点击处理用

const rad = d => d * Math.PI / 180;

// 坐标与尺寸由配置给 —— 星图从投影算，概念图直接读数据。
// 引擎只认「一个点有 [x, y]」，布局是调用方的事。
const project = CFG.project;
const starRadius = CFG.radius;

function build(){
  if (!DATA) return;                       // 数据没到就点切换按钮，会炸在 DATA.cultures
  svg.innerHTML = '';
  const W = innerWidth, H = innerHeight;
  svg.setAttribute('viewBox', `${-R*2.05} ${-R*2.05} ${R*4.1} ${R*4.1}`);
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');

  const gGui = document.createElementNS(NS,'g');
  const gLink = document.createElementNS(NS,'g');
  const gStar = document.createElementNS(NS,'g');
  const gName = document.createElementNS(NS,'g');
  const gLinkHit = document.createElementNS(NS,'g');
  const gFig = document.createElementNS(NS,'g');
  const defs = document.createElementNS(NS,'defs');
  // artgold：把灰度插画变成「金色 + 亮度即不透明度」。
  // 上游插画是黑底不透明的灰度图（Stellarium 用加色混合渲染）。这里不靠
  // mix-blend-mode —— SVG 里它跟 HTML 背景不在同一个层叠上下文，黑底会
  // 原样盖住星点。把亮度搬进 alpha 通道更稳，而且明暗层次原样保留。
  defs.innerHTML =
      '<filter id="artgold" color-interpolation-filters="sRGB">'
    + '<feColorMatrix type="matrix" values="'
    +   '0 0 0 0 0.86  0 0 0 0 0.71  0 0 0 0 0.38  0.34 0.34 0.32 0 0"/></filter>'
    + '<filter id="artglow" color-interpolation-filters="sRGB" '
    +   'x="-25%" y="-25%" width="150%" height="150%">'
    + '<feColorMatrix type="matrix" values="'
    +   '0 0 0 0 0.92  0 0 0 0 0.78  0 0 0 0 0.45  0.34 0.34 0.32 0 0"/>'
    + '<feGaussianBlur stdDeviation="6"/></filter>';
  // 象形在最底 —— 它是虚影，不该盖住星点和连线
  svg.append(defs, gGui, gFig, gLink, gLinkHit, gStar, gName);

  const tierV = CFG.tiers[site][1];

  // 参考圈：星图是三规，概念图是抽象层级圈。半径由配置算。
  for (const [r, cls, label] of CFG.rings(DATA, tierV)){
    const c = document.createElementNS(NS,'circle');
    c.setAttribute('r', r); c.setAttribute('class', cls);
    gGui.appendChild(c);
    const t = document.createElementNS(NS,'text');
    t.setAttribute('class','gui-label');
    t.setAttribute('x', 4); t.setAttribute('y', -r - 5);
    t.textContent = label; gGui.appendChild(t);
  }

  const cul = DATA.cultures[culture];
  const stars = DATA.stars, names = DATA.names;

  // 点集：星图两套文化本来就用不同的星，按文化取子集是对的；
  // 概念图主张「同一批点、两种划法」，必须恒定全量。
  let used;
  if (CFG.pointSet === 'all') used = new Set(Object.keys(stars));
  else {
    used = new Set();
    cul.groups.forEach(g => g.lines.forEach(l => l.forEach(h => used.add(h))));
  }

  const nodeOf = new Map();
  let lostCount = 0;

  for (const hip of used){
    const f = stars[hip];
    const [x, y] = project(f[0], f[1]);
    const below = !CFG.visible(f, tierV);
    if (below) lostCount++;

    const c = document.createElementNS(NS,'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y);
    c.setAttribute('r', starRadius(f));
    c.setAttribute('class','star twinkle');
    c.style.setProperty('--o', below ? .12 : CFG.dim(f));
    const [dur, del] = CFG.phase(hip);
    c.style.setProperty('--dur', dur.toFixed(2) + 's');
    c.style.setProperty('--del', del.toFixed(2) + 's');
    if (below) c.style.fill = 'rgba(201,80,63,.5)';
    gStar.appendChild(c);
    nodeOf.set(hip, c);

    // 命中区比星点大，否则暗星点不中
    const hit = document.createElementNS(NS,'circle');
    hit.setAttribute('cx', x); hit.setAttribute('cy', y);
    hit.setAttribute('r', 5); hit.setAttribute('class','hit');
    hit.addEventListener('mousemove', e => showTip(e, hip, below));
    hit.addEventListener('mouseleave', hideTip);
    gStar.appendChild(hit);
  }

  document.getElementById('lost').textContent =
    lostCount ? CFG.text.lost(lostCount) : '';

  // 连线：每段一条 path，长度写进 CSS 变量供逐段生长用
  for (const g of cul.groups){
    g._paths = [];
    const ds = [];
    let acc = 0;
    for (const line of g.lines){
      const pts = line.map(h => project(...stars[h].slice(0,2)));
      let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
      let len = 0;
      for (let i = 1; i < pts.length; i++){
        d += ` L${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)}`;
        len += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
      }
      const p = document.createElementNS(NS,'path');
      p.setAttribute('d', d); p.setAttribute('class','link');
      p.style.setProperty('--len', len.toFixed(1));
      // 生长时长按「折点数」给节奏，不按绝对像素 —— 全天图里跨半个天球的
      // 星官长度可达 1500px，除以速度会得到十几秒，那不叫缓慢叫卡住。
      const grow = Math.min(1.6, .34 + (pts.length - 1) * .17);
      p.style.setProperty('--grow', grow.toFixed(2) + 's');
      p.style.setProperty('--wait', acc.toFixed(2) + 's');
      acc += grow * .5;                              // 段与段叠一半，连贯不拖沓
      gLink.appendChild(p);
      g._paths.push(p);
      ds.push(d);
    }
    g._total = acc;
    g._d = ds;

    // 星官名：放在成员星的重心
    const all = g.lines.flat();
    const cx = all.reduce((s,h)=>s+project(...stars[h].slice(0,2))[0],0)/all.length;
    const cy = all.reduce((s,h)=>s+project(...stars[h].slice(0,2))[1],0)/all.length;
    const t = document.createElementNS(NS,'text');
    t.setAttribute('x', cx); t.setAttribute('y', cy - 14);
    t.setAttribute('text-anchor','middle');
    t.setAttribute('class','gname');
    t.setAttribute('font-size', 13);
    t.textContent = g.name;
    gName.appendChild(t);
    g._label = t;
    g._members = new Set(all);
    g._center = [cx, cy];
    g._mini = null;

    // 有讲解的星官在全天图上留一道极淡轮廓 —— 它同时是「这里点得开」的提示。
    // 相位按名字散列错开，整片天才会像在各自闪，而不是一起呼吸。
    if (loreOf(g)){
      const hash = [...g.name].reduce((a, c) => a + c.charCodeAt(0), 0);
      g._paths.forEach(q => {
        q.style.setProperty('--rest', '.19');
        q.style.setProperty('--bdur', (5.4 + hash % 43 / 10).toFixed(1) + 's');
        q.style.setProperty('--bdel', (hash % 61 / 7).toFixed(1) + 's');
        q.classList.add('lore');
      });
    }

    // 命中条：整组折线合成一条透明粗线。比「找最近的成员星」准，也便宜。
    const hp = document.createElementNS(NS,'path');
    hp.setAttribute('d', ds.join(' '));
    hp.setAttribute('class','linkhit');
    hp.addEventListener('mouseenter', e => hoverGroup(g, e));
    hp.addEventListener('mousemove', moveCard);
    hp.addEventListener('mouseleave', unhoverGroup);
    gLinkHit.appendChild(hp);

    // 象形：由两颗锚星反推的相似变换。matrix(ux,uy,-uy,ux,Ax,Ay) 把
    // (0,0)送到 A、(1,0)送到 B，垂直方向等比 —— 图形随之整体旋转缩放。
    // 象形只登记，不建 DOM。85 张插画各带一层高斯模糊，建图时全建出来
    // 会把首屏拖到几十秒 —— 即使 opacity 为 0，浏览器照样要栅格化滤镜。
    // 真正建元素推迟到第一次需要显示时（见 ensureFig）。
    // 插画。被投影撕开的星官不贴 —— 锚星散在外圈一整周，解出来的仿射
    // 会把 512px 的画撑得比整张天图还大。是投影的限制，不是配准算错了。
    const memb = [...new Set(g.lines.flat())];
    const artOK = !CFG.artUsable || CFG.artUsable(memb, stars);
    if (g.art && artOK && g.art.an.every(a => stars[a[2]])){
      g._artM = artMatrix(g.art, stars).m;
    }

    // 每次重建都要清掉 DOM 缓存 —— 组对象来自 DATA、跨 build 存活，而
    // svg.innerHTML='' 已经把上一轮的元素连根拔了。不清就会拿到一个
    // 脱离文档的旧节点，class 加得上、屏幕上什么也不出现。
    g._fig = null;
    g._figHost = gFig;

    // 名字本身也是入口：点开之后把鼠标放上去，出同一张卡
    t.addEventListener('mouseenter', e => showCard(g, e));
    t.addEventListener('mousemove', moveCard);
    t.addEventListener('mouseleave', hideCard);
  }

  CUL = cul; NODEOF = nodeOf;
  window._nodeOf = nodeOf;
  window._groups = cul.groups;              // 供自动化核对，不参与渲染
}

// 点击只注册一次。它原来写在 build() 里面，于是每切一次中西就多挂一个
// 监听器，而旧的那个闭包还抓着旧 culture —— 先注册的先跑，后面的撞上
// `if (sel) return` 直接退出。症状：切到西方，点猎户座，弹出「参宿」。
function pick(e){
  const pt = svgPoint(e);
  // 阈值必须换算成屏幕像素：放大之后 40 个 SVG 单位会占掉半个屏，
  // 那样点哪儿都命中；缩小时又小得点不着。
  const vbw = +svg.getAttribute('viewBox').split(/\s+/)[2];
  // 手指的落点比鼠标散，容差放宽。这么做是安全的：下面永远取最近的那一组，
  // lim 只决定「这一下收不收」，放宽不会让它更容易点错组，只会少漏几下。
  const lim = (matchMedia('(hover: none)').matches ? 36 : 26)
              * vbw / svg.getBoundingClientRect().width;
  let best = null, bd = 1e9;
  for (const g of CUL.groups){
    for (const h of g._members){
      const [x,y] = project(...DATA.stars[h].slice(0,2));
      const d = Math.hypot(x-pt.x, y-pt.y);
      if (d < bd){ bd = d; best = g; }
    }
  }
  return bd < lim ? best : null;
}

svg.addEventListener('click', e => {
  if (!CUL) return;
  const g = pick(e);
  if (!g || g === sel) return;
  // 已经在某个星官里 → 点旁边那颗暗星就直接平移过去，不必先退出再进
  open(g, NODEOF, sel ? 1150 : 900);
});

/* ── 插画配准 ─────────────────────────────────────
   每幅插画自带三颗锚星的像素坐标。三对「像素 ↔ 星位」定一个仿射变换，
   平移旋转缩放错切都能吃下。Stellarium 自己也是这么贴的。*/
function solve3(A, rhs){
  const m = A.map((r, i) => [...r, rhs[i]]);
  for (let i = 0; i < 3; i++){
    let p = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = i + 1; k < 3; k++){
      const f = m[k][i] / m[i][i];
      for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--){
    let t = m[i][3];
    for (let j = i + 1; j < 3; j++) t -= m[i][j] * x[j];
    x[i] = t / m[i][i];
  }
  return x;
}

function artMatrix(art, stars){
  const rows = art.an.map(a => [a[0], a[1], 1]);
  const pts  = art.an.map(a => project(...stars[a[2]].slice(0, 2)));
  const [a, c, e] = solve3(rows, pts.map(q => q[0]));
  const [b, d, f] = solve3(rows, pts.map(q => q[1]));
  // 线性部分的面积倍率开根 = 长度倍率。乘画幅宽度，就是这幅画贴到
  // 天上有多宽 —— 调用方拿它判断这次配准是不是失控了。
  const span = art.wh[0] * Math.sqrt(Math.abs(a * d - b * c));
  return {
    m: `matrix(${a.toFixed(5)},${b.toFixed(5)},${c.toFixed(5)},${d.toFixed(5)},`
     + `${e.toFixed(3)},${f.toFixed(3)})`,
    span,
  };
}

/* ── 讲解取用 ──────────────────────────────────── */
function loreOf(g){ return (DATA.lore && DATA.lore[g.name]) || null; }

/** 卡片上只放第一句。长文留给点开后的面板，不在悬停时糊一屏。 */
function briefOf(t){
  const i = t.indexOf('。');
  return i > 0 ? t.slice(0, i + 1) : t;
}

/** 缩略图：把该星官的折线归一化进 54×54。用的是同一份连线数据，
 *  不是另画的插图 —— 所以它跟大图上看到的形状一定一致。 */
function miniOf(g){
  if (g._mini) return g._mini;
  const P = h => project(...DATA.stars[h].slice(0, 2));
  const pts = [...g._members].map(P);
  const xs = pts.map(v => v[0]), ys = pts.map(v => v[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const B = 54, pad = 8, span = Math.max(x1 - x0, y1 - y0) || 1;
  const k = (B - pad * 2) / span;
  const ox = (B - (x1 - x0) * k) / 2, oy = (B - (y1 - y0) * k) / 2;
  const T = (x, y) => [((x - x0) * k + ox).toFixed(1), ((y - y0) * k + oy).toFixed(1)];
  let d = '';
  for (const line of g.lines)
    line.forEach((h, i) => { const [a, b] = T(...P(h)); d += i ? ` L${a} ${b}` : `M${a} ${b}`; });
  const dots = pts.map(v => { const [a, b] = T(...v); return `<circle cx="${a}" cy="${b}" r="1.3"/>`; }).join('');
  g._mini = `<svg class="mini" viewBox="0 0 ${B} ${B}"><path d="${d}"/>${dots}</svg>`;
  return g._mini;
}

/** 第一次要显示某个星官的象形时才建 DOM。之前是建图时全建，
 *  85 张带滤镜的插画把首屏拖死了。建完挂在 g._fig 上，之后直接复用。 */
function ensureFig(g){
  if (g._fig || !g._figHost) return g._fig;
  const host = g._figHost;
  const fig = document.createElementNS(NS,'g');
  fig.setAttribute('class','fig');

  if (g._artM){
    for (const [cls, flt] of [['artglow','artglow'], ['artimg','artgold']]){
      const im = document.createElementNS(NS,'image');
      im.setAttribute('href', 'art/' + g.art.f);
      im.setAttribute('x', 0); im.setAttribute('y', 0);
      im.setAttribute('width', g.art.wh[0]); im.setAttribute('height', g.art.wh[1]);
      im.setAttribute('transform', g._artM);
      im.setAttribute('filter', `url(#${flt})`);
      im.setAttribute('class', cls);
      fig.appendChild(im);
    }
  } else return null;

  host.appendChild(fig);
  g._fig = fig;
  return fig;
}

let hoverG = null;
function hoverGroup(g, e){
  if (sel) return;                                  // 点开之后不再抢注意力
  if (hoverG === g) return;
  unhoverGroup();
  hoverG = g;
  g._paths.forEach(q => q.classList.add('lit'));
  g._label.classList.add('lit');
  ensureFig(g)?.classList.add('on');
  showCard(g, e);
}
function unhoverGroup(){
  if (!hoverG) return;
  hoverG._paths.forEach(q => q.classList.remove('lit'));
  hoverG._label.classList.remove('lit');
  hoverG._fig?.classList.remove('on');
  hoverG = null;
  hideCard();
}

function showCard(g, e){
  tip.classList.remove('on');                       // 星卡与星官卡不同时出现
  const lore = loreOf(g);
  card.innerHTML =
    `<div class="hd">${miniOf(g)}<div><div class="cn">${g.name}</div>` +
    (g.en && g.en !== g.name ? `<div class="ce">${g.en}</div>` : '') + `</div></div>` +
    (lore ? `<div class="cb">${briefOf(lore)}</div>`
          : `<div class="cb todo">${CFG.text.noBrief}</div>`);
  card.classList.add('on');
  moveCard(e);
}
function moveCard(e){
  const w = card.offsetWidth || 296, h = card.offsetHeight || 100;
  card.style.left = Math.min(Math.max(e.clientX, w / 2 + 8), innerWidth - w / 2 - 8) + 'px';
  card.style.top = Math.max(h + 16, e.clientY) + 'px';
}
const hideCard = () => card.classList.remove('on');

function svgPoint(e){
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

let revealT = null;

function open(g, nodeOf, ms = 900){
  clearTimeout(revealT);                            // 上一个星官的浮出计时得掐掉
  unhoverGroup(); hideCard();
  document.getElementById('panel').classList.remove('show');
  document.querySelectorAll('.gname').forEach(t => t.classList.remove('show','lit'));
  document.querySelectorAll('.fig').forEach(f => f.classList.remove('on'));
  sel = g;
  document.body.classList.add('open');
  svg.classList.add('zoomed');

  // 缩进：viewBox 补间推到该星官
  const pts = [...g._members].map(h => project(...DATA.stars[h].slice(0,2)));
  const xs = pts.map(p=>p[0]), ys = pts.map(p=>p[1]);
  const pad = 120;
  const raw = Math.max(260, pad * 2 + Math.max(
    Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
  const CAP = R * 4.1 * .52;
  const sz = Math.min(raw, CAP);
  let cx, cy;
  if (raw > CAP){          // 撕开的、或本来就横跨很大的，都对准最亮星
    // 北极方位等距投影把南天极摊成整个外圈 —— 南极座那三颗星散在圈上一整周，
    // 包围盒等于整张图，「放大」等于没放大。这种时候对准最亮的成员星：
    // 那是来找它的人真正要看的那颗，也是唯一能稳定选中的落点。
    const bright = [...g._members].reduce((a, h) =>
      DATA.stars[h][2] < DATA.stars[a][2] ? h : a);
    [cx, cy] = project(...DATA.stars[bright].slice(0,2));
  } else {
    cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  frameOn(cx, cy, sz, ms);

  // 非成员星退到背景。先清再加 —— 跳到邻近星官时旧成员否则会同时带两个类
  for (const [hip, node] of nodeOf){
    node.classList.remove('member','dimmed');
    node.classList.add(g._members.has(hip) ? 'member' : 'dimmed');
  }
  document.querySelectorAll('.link').forEach(q => {
    q.classList.remove('draw','armed','lit');
    q.classList.add('other');
  });

  // 逐段生长：armed 把线拉回起点，强制回流后再 draw，否则两个类被合并成一帧
  g._paths.forEach(q => {
    q.classList.remove('other');
    q.classList.add('armed');
    void q.getBBox();
    q.classList.add('draw');
  });

  // 连完才浮出名字与讲解
  // 连完线才浮出：名字、象形、讲解 —— 这就是「整体效果」那一刻
  revealT = setTimeout(() => {
    g._label.classList.add('show');
    ensureFig(g)?.classList.add('on');
    showPanel(g);
    markChips();
  }, g._total * 1000 + 320);
}

function close(){
  if (!sel) return;
  clearTimeout(revealT);
  hideCard();
  const g = sel; sel = null;
  document.body.classList.remove('open');
  svg.classList.remove('zoomed');
  document.getElementById('panel').classList.remove('show');
  g._label.classList.remove('show');
  g._paths.forEach(p => p.classList.remove('draw','armed'));
  document.querySelectorAll('.link').forEach(p => p.classList.remove('other'));
  document.querySelectorAll('.star').forEach(n => n.classList.remove('member','dimmed'));
  document.querySelectorAll('.fig').forEach(f => f.classList.remove('on'));
  frameOn(0, 0, R * 4.1 * 1.06, 780, 0);   // 稍微放宽，让检索栏不吃掉外规
  markChips();
}

/** 把 (cx,cy) 摆到实际看得见那块区域的中心。
 *  左边压着检索栏、下边压着讲解面板，按视口正中对齐会让星官藏在栏底下。
 *  换算按 preserveAspectRatio="xMidYMid meet" 的实际投影公式来，不是估的：
 *      screen_x = (x - vx) * scale + (W - size*scale) / 2
 */
function frameOn(cx, cy, size, ms, bottomGap = 150){
  const W = innerWidth, H = innerHeight;
  const railW = document.body.classList.contains('rail-off') ? 0 : 212;
  const scale = Math.min(W, H) / size;
  const tx = railW + (W - railW) / 2;
  const ty = (H - bottomGap) / 2;
  const vx = cx - (tx - (W - size * scale) / 2) / scale;
  const vy = cy - (ty - (H - size * scale) / 2) / scale;
  animateViewBox(vx, vy, size, size, ms);
}

let vbAnim = null;
function animateViewBox(x, y, w, h, ms){
  // rAF 在隐藏标签页里不触发；这里保底直接落位，可见时才逐帧补间
  if (document.hidden){ svg.setAttribute('viewBox', [x,y,w,h].map(n=>n.toFixed(1)).join(' ')); return; }
  const cur = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const t0 = performance.now();
  if (vbAnim) cancelAnimationFrame(vbAnim);
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => {
    const t = Math.min(1, (now - t0) / ms), k = ease(t);
    const v = cur.map((c, i) => c + ([x,y,w,h][i] - c) * k);
    svg.setAttribute('viewBox', v.map(n=>n.toFixed(1)).join(' '));
    if (t < 1) vbAnim = requestAnimationFrame(step);
  };
  vbAnim = requestAnimationFrame(step);
}

function showTip(e, hip, below){
  card.classList.remove('on');                       // 单点卡出现时收掉分组卡
  tip.classList.add('on');
  tip.style.left = e.clientX + 'px';
  tip.style.top = e.clientY + 'px';
  tip.innerHTML = CFG.tipRows(hip, DATA, below);
}
const hideTip = () => tip.classList.remove('on');

function showPanel(g){
  const p = document.getElementById('panel');
  document.getElementById('pn').textContent = g.name;
  document.getElementById('pp').textContent = g.py || '';
  document.getElementById('pe').textContent = g.en && g.en !== g.name ? g.en : '';
  document.getElementById('pf').innerHTML =
    CFG.facts(g, DATA, CFG.tiers[site][1], CFG.tiers[site][0]);
  const lore = loreOf(g);
  const t = document.getElementById('pt');
  if (lore){ t.textContent = lore; t.classList.remove('todo'); }
  else { t.textContent = CFG.text.noLore; t.classList.add('todo'); }
  p.classList.add('show');
}

document.getElementById('close').addEventListener('click', close);
document.getElementById('back').addEventListener('click', close);

// 来源面板。CFG.credits 是每份数据自己的署名 —— 数据换了，义务也换了。
const srcBox = document.getElementById('src');
document.getElementById('srcbtn').addEventListener('click',
  () => srcBox.classList.add('on'));
document.getElementById('srcclose').addEventListener('click',
  () => srcBox.classList.remove('on'));
srcBox.addEventListener('click', e => {
  if (e.target === srcBox) srcBox.classList.remove('on');   // 点背景也能关
});
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

function bindSeg(){
document.querySelectorAll('.seg button').forEach(b => {
  b.addEventListener('click', () => {
    if (sel) close();
    document.querySelectorAll('.seg button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    culture = b.dataset.c;
    document.getElementById('hint').textContent = CFG.text.hint(culture);
    build();
  });
});
}

const sel_site = document.getElementById('site');
CFG.tiers.forEach(([n], i) => {
  const o = document.createElement('option');
  o.value = i; o.textContent = n; sel_site.appendChild(o);
});
sel_site.value = site;
sel_site.addEventListener('change', () => { if (sel) close(); site = +sel_site.value; build(); });

addEventListener('resize', () => { if (!sel) build(); });

// 数据会变，每次跟服务器核一下再决定用不用缓存
/* ── 检索栏 ───────────────────────────────────────
   索引跨两套文化建，所以在西方模式下搜「北斗」也找得到 —— 选中会自动
   切回中国星官再展开。星名也进索引：搜「天狼」能找到它所属的星官。 */
// 侧栏分区由配置给。

let INDEX = [];

function buildIndex(){
  INDEX = [];
  for (const [cul, c] of Object.entries(DATA.cultures)){
    for (const g of c.groups){
      const names = [...new Set(g.lines.flat())]
        .map(h => DATA.names[h]).filter(Boolean);
      INDEX.push({
        n: g.name, c: cul, py: g.py || '', en: g.en || '',
        stars: names,
        hay: (g.name + ' ' + (g.py || '') + ' ' + (g.en || '') + ' ' + names.join(' ')).toLowerCase(),
      });
    }
  }
}

function search(q){
  q = q.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const e of INDEX){
    if (!e.hay.includes(q)) continue;
    // 名字开头命中排最前，其次名字含，最后才是靠星名或拼音带出来的
    const rank = e.n.toLowerCase().startsWith(q) ? 0
               : e.n.toLowerCase().includes(q) ? 1
               : e.en.toLowerCase().startsWith(q) ? 2 : 3;
    out.push({ e, rank, why: rank === 3 ? (e.stars.find(x => x.toLowerCase().includes(q)) || '') : '' });
  }
  out.sort((a, b) => a.rank - b.rank || a.e.n.length - b.e.n.length);
  return out.slice(0, 24);
}

/** 按名字跳过去：必要时先切文化，再展开。 */
function goto(name){
  const e = INDEX.find(x => x.n === name);
  if (!e) return;
  if (culture !== e.c){
    if (sel) close();
    culture = e.c;
    document.querySelectorAll('.seg button')
      .forEach(b => b.classList.toggle('on', b.dataset.c === culture));
    document.getElementById('hint').textContent = CFG.text.hint(culture);
    build();
  }
  const g = CUL && CUL.groups.find(x => x.name === name);
  if (g) open(g, NODEOF, sel ? 1150 : 900);
  markChips();
}

function markChips(){
  const cur = sel ? sel.name : null;
  document.querySelectorAll('.chip').forEach(c =>
    c.classList.toggle('cur', c.dataset.n === cur));
}

function chipRow(title, list){
  const sec = document.createElement('div');
  sec.className = 'railsec';
  const h = document.createElement('h3');
  h.textContent = title;
  const box = document.createElement('div');
  box.className = 'chips';
  for (const n of list){
    if (!INDEX.some(x => x.n === n)) continue;       // 数据里没有就不摆按钮
    const b = document.createElement('div');
    b.className = 'chip'; b.textContent = n; b.dataset.n = n;
    b.addEventListener('click', () => goto(n));
    box.appendChild(b);
  }
  sec.append(h, box);
  return sec;
}

function renderSecs(){
  const secs = document.getElementById('secs');
  secs.innerHTML = '';
  for (const [title, list] of CFG.rail) secs.appendChild(chipRow(title, list));
}

const qBox = document.getElementById('q');
const hitsBox = document.getElementById('hits');
let hitList = [], hitAt = -1;

function renderHits(){
  const q = qBox.value;
  const secs = document.getElementById('secs');
  hitList = search(q); hitAt = hitList.length ? 0 : -1;
  hitsBox.innerHTML = '';
  secs.style.display = q.trim() ? 'none' : '';
  if (!q.trim()) return;
  if (!hitList.length){
    hitsBox.innerHTML = '<div class="none">没有匹配的星官</div>';
    return;
  }
  hitList.forEach((h, i) => {
    const row = document.createElement('div');
    row.className = 'hit-row' + (i === hitAt ? ' sel' : '');
    row.innerHTML = `<span class="hn">${h.e.n}</span>`
      + (h.why ? `<span class="hw">${h.why}</span>` : '')
      + `<span class="hm">${CFG.text.tag(h.e.c)}</span>`;
    row.addEventListener('click', () => { goto(h.e.n); qBox.value = ''; renderHits(); });
    hitsBox.appendChild(row);
  });
}

qBox.addEventListener('input', renderHits);
qBox.addEventListener('keydown', e => {
  if (!hitList.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault();
    hitAt = (hitAt + (e.key === 'ArrowDown' ? 1 : -1) + hitList.length) % hitList.length;
    [...hitsBox.children].forEach((c, i) => c.classList.toggle('sel', i === hitAt));
    hitsBox.children[hitAt].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && hitAt >= 0){
    goto(hitList[hitAt].e.n); qBox.value = ''; renderHits();
  } else if (e.key === 'Escape'){
    qBox.value = ''; renderHits(); qBox.blur();
  }
});

function toggleRail(force){
  document.body.classList.toggle('rail-off', force);
  // 栏宽变了，取景基准跟着变；不重算的话展开中的星官会被压在栏底下。
  // 手机上侧栏是浮层不推正文，基准其实没变，重算一次也无害。
  if (sel) open(sel, NODEOF, 420);
  else if (DATA) frameOn(0, 0, R * 4.1 * 1.06, 420, 0);
}
document.getElementById('railtoggle').addEventListener('click', () => toggleRail());

/* ── 进去之后怎么办 ─────────────────────────────
   反馈是「点开之后不知道怎么操作」。查了一下确实如此：底部那行提示
   在 body.open 时被整个隐掉，点进星官之后一条引导都不剩，
   而「点旁边的暗星会跳到那颗星所在的星官」这种事没人猜得到。

   放在面板里而不是屏幕角落 —— 点进去之后眼睛就在面板上。 */
const guide = document.createElement('div');
guide.id = 'pguide';
guide.textContent = CFG.text.guide;
document.getElementById('panel').appendChild(guide);

/* 头一回来给三行说明，点一下就走，之后不再出现。
   记在 localStorage 里；隐私上无所谓 —— 存的是「看过了」，不是身份。 */
if (CFG.text.firstrun && !localStorage.getItem('xingtu-seen')){
  const fr = document.createElement('div');
  fr.id = 'firstrun';
  fr.innerHTML = CFG.text.firstrun.map((t, i) =>
    `<div class="fl"><b>${i + 1}</b>${t}</div>`).join('')
    + '<div class="fx">知道了</div>';
  document.body.appendChild(fr);
  const dismiss = () => {
    fr.classList.add('gone');
    localStorage.setItem('xingtu-seen', '1');
    setTimeout(() => fr.remove(), 500);
  };
  fr.querySelector('.fx').addEventListener('click', dismiss);
  svg.addEventListener('click', dismiss, { once: true });
  requestAnimationFrame(() => fr.classList.add('on'));
  setTimeout(() => fr.classList.add('on'), 60);   // 后台标签页 rAF 不触发，补一手
}

/* ── 手机与触摸 ─────────────────────────────────
   两件事 CSS 做不到，只能在这里补。

   一、手机上侧栏默认收起。它在 375px 宽的屏上占 57%，
       展开着的话第一眼看到的是名单，不是星图。

   二、触摸设备上没有 mouseleave —— 手指抬起不触发任何「离开」。
       桌面版靠 mouseleave 收提示卡，照搬到手机上就是卡片出来了
       再也收不回去。这里改成：点到既不是星、也不是星官名的地方就收。
       卡片自己要排除在外，否则点卡片里的字会把它关掉。 */
if (matchMedia('(max-width: 820px)').matches) document.body.classList.add('rail-off');

if (matchMedia('(hover: none)').matches){
  document.addEventListener('click', e => {
    // 遮罩是 body 的伪元素，点它事件落在 body 上 —— 借这个收侧栏
    if (e.target === document.body && !document.body.classList.contains('rail-off')){
      toggleRail(true);
      return;
    }
    if (!e.target.closest('.hit,.linkhit,.gname,#tip,#card')){
      hideTip(); hideCard();
    }
  });
}

// 按 / 直接聚焦搜索框，跟大多数工具一致
addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== qBox){
    e.preventDefault(); qBox.focus();
  }
});

fetch(CFG.data, {cache:'no-cache'}).then(r => r.json()).then(d => {
  DATA = d;
  document.getElementById('title').textContent = CFG.text.title;
  document.getElementById('q').placeholder = CFG.text.placeholder;
  document.getElementById('back').textContent = CFG.text.back;
  document.getElementById('srcbody').innerHTML = CFG.credits;
  document.getElementById('hint').textContent = CFG.text.hint(culture);
  const seg = document.querySelector('.seg');
  seg.innerHTML = CFG.cultures.map(([k, label], i) =>
    `<button data-c="${k}"${i === 0 ? ' class="on"' : ''}>${label}</button>`).join('');
  bindSeg();
  buildIndex();
  renderSecs();
  build();
});
}
