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
  /* 缩进着的时候重建（转球松手会走到这儿）不能把视野打回全天 ——
     那样一松手就跳出去了。留住当前 viewBox。 */
  const keep = sel && svg.getAttribute('viewBox');
  setVB(keep || fullVB());
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

  /* 球面模式下三规不是圆而是折线（大圆看过去是椭圆，还有一半在背面），
     由配置算好 d 交过来。平面模式这里返回空数组，走下面的老路。 */
  /* 名字落在各自那道圈的顶点上。
     上一版给四道圈写死同一个坐标，四个词叠在一处 —— 屏幕上只看得出
     一个「圈」字，别的全糊了。位置现在由 ringPaths 连同路径一起给。 */
  const ringLbl = [];
  for (const [d, cls, label, at] of (CFG.ringPaths ? CFG.ringPaths(DATA, tierV) : [])){
    if (!d) continue;
    const q = document.createElementNS(NS,'path');
    q.setAttribute('d', d); q.setAttribute('class', cls);
    gGui.appendChild(q);
    if (!label) continue;
    /* 中点撞在一起的两道圈还是有（低纬度下恒显圈和地平圈几乎相切），
       撞了就往下让一行。--sfs 写在 svg 上，不在 :root —— 从 :root 读
       只会拿到空串，退到 CSS 里那个缺省值。 */
    let [lx, ly] = at || [6, -R * 1.9];
    ly -= 10;
    const em = 11 * (parseFloat(svg.style.getPropertyValue('--sfs')) || 2.2);
    const halfW = n => n * em * 0.58;              // 字宽含 .16em 字距
    for (let i = 0; i < 6 && ringLbl.some(
           o => Math.abs(o[0] - lx) < halfW(o[2] + label.length)
             && Math.abs(o[1] - ly) < em * 1.3); i++) ly += em * 1.4;
    ringLbl.push([lx, ly, label.length]);
    const t = document.createElementNS(NS,'text');
    t.setAttribute('class','gui-label');
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('x', lx.toFixed(1)); t.setAttribute('y', ly.toFixed(1));
    t.textContent = label; gGui.appendChild(t);
  }

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

  /* ── 地影：把地上的轮廓投到天上 ──────────────────
     这一层跟星点不是一回事，所以画法也刻意不一样：
     星与星官是金色的实线，这一层是青灰的细线、中国疆域是朱线，
     十二州是朱点带名。一眼分得出「上面那层是天，底下那层是地」。

     它回答的是分野真正在问的那个问题：这块天，压在地上的哪儿。
     转球的时候两层一起转，对应关系是看得见的。

     必须说明白：地球一天转一圈，「哪块天压在哪块地上」时时刻刻在变。
     这一层不是天象，是一次对照 —— 固定在「选中那座城正当头」的那一瞬。 */
  /* 两套星官下都画。
     上一版把整层地影锁在「中国星官」下，理由是分野属于中国星占 ——
     那条理由只对十二州成立。十二州已经撤了，剩下的是海岸线与疆域，
     那是地理，不是星占：**站在哪儿看天，跟你用哪套星名没有关系**。
     反馈说「东方有当前位置坐标，西方星座就没有了」，说的正是这个。 */
  /* 什么时候不画地上这一点：**只有天球有这个问题**。
     球是不透明的，转到背面的就该看不见。
     摊平的那张没有背面 —— 北极方位等距投影一次摊完整个天区，
     连永不升起的那一片也在图上（星点也一样，只是压暗，并不剔除）。

     上一版两张图共用了天球那条 depth 关，于是摊平的那张被无端切掉半个球。
     柏林这一档实测：中国 277 个环里 61 个整环消失、972 个顶点掉 131 个，
     而且全落在东经 110–115° —— 南海诸岛和十段线那一片正好整段没了。
     反馈说「中国疆域没了一半」，说的就是这个。 */
  if (GEO && CFG.skyOf && CFG.VIEW){
    const pr = (la, lo) => {
      const [ra, dec] = CFG.skyOf(la, lo, site);
      return CFG.VIEW.mode !== 'sphere' || CFG.depth(ra, dec) > 0.015
        ? CFG.project(ra, dec) : null;
    };
    const gEarthSky = document.createElementNS(NS,'g');
    gEarthSky.setAttribute('class','earthsky');
    const put = (d, cls) => { if (!d) return;
      const n = document.createElementNS(NS,'path');
      n.setAttribute('d', d); n.setAttribute('class', cls);
      gEarthSky.appendChild(n); };
    put(segsToD(projectRings(GEO.land, pr)), 'skland');
    put(segsToD(projectRings(GEO.china, pr)), 'skchina');
    // 十二州：转到哪儿了得有名字才说得清
    // 插在参考圈之后、连线之前 —— 地在下，天在上
    gGui.appendChild(gEarthSky);
  }

  /* 观测地的天顶。
     它是**天球上的一个点**，不是屏幕中央的一个记号 ——
     第一版画死在原点，转了球它还赖在正中间，那当然不对。
     现在跟别的星一样投影：一转开就挪到边上，转到背面就不画。 */
  /* 平面那张也标。它不按观测地居中 —— 那张图的中心永远是北天极，
     这是等距方位投影的形制。但总得让人看见「我选的地方在哪儿」，
     否则换城市屏幕上什么都不动，看着像坏了。 */
  if (CFG.VIEW && CFG.sites && CFG.ZENITH){
    const Z = CFG.ZENITH;
    const st = CFG.sites[Z.site] || CFG.sites[site];
    if (!(CFG.cull && CFG.cull([Z.ra, Z.dec]))){
      const [zx, zy] = project(Z.ra, Z.dec);
      const z = document.createElementNS(NS,'g');
      z.setAttribute('class','zenith');
      z.setAttribute('transform', `translate(${zx.toFixed(1)} ${zy.toFixed(1)})`);
      const mk = (t, a) => { const n = document.createElementNS(NS,t);
        for (const k in a) n.setAttribute(k, a[k]); return n; };
      z.appendChild(mk('circle', { r: 5 }));
      z.appendChild(mk('circle', { r: 13, class: 'zring' }));
      z.appendChild(mk('line', { x1: -20, y1: 0, x2: -13, y2: 0 }));
      z.appendChild(mk('line', { x1: 13, y1: 0, x2: 20, y2: 0 }));
      z.appendChild(mk('line', { x1: 0, y1: -20, x2: 0, y2: -13 }));
      z.appendChild(mk('line', { x1: 0, y1: 13, x2: 0, y2: 20 }));
      const t = mk('text', { x: 0, y: -26, class: 'zlabel' });
      t.textContent = st.n + ' · 天顶';
      z.appendChild(t);
      gGui.appendChild(z);
    }
  }

  if (CFG.VIEW && CFG.VIEW.mode === 'sphere') drawEarth();

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

  /* 闪动只给最亮的一批。
     量出来的事实：全天图上 1386 颗星每颗挂一条 infinite 的 opacity
     关键帧，加上 419 条星官轮廓在呼吸，document.getAnimations()
     数到 1814 个动画同时在跑。改完是 659。

     没有量到的事实：帧率。开发时预览窗没在合成，rAF 不触发，
     测不了 —— 所以这里不写「快了多少」，只写动画数。
     判断依据是另一条：SVG 元素上的 opacity 动画进不了合成层，
     每帧都要走样式与绘制，不像 HTML 层的 opacity 那样白拿。

     视觉代价接近零：暗星本来就闪不出什么（--o 只有 0.3 上下，
     再乘 0.38 的落差不到十分之一档）。
     概念图只有 161 个点，够不到这个上限，等于不受影响。 */
  const TWINKLE_MAX = 240;
  const twinkling = new Set(
    [...used]
      .filter(h => CFG.visible(stars[h], tierV))     // 地平线下的本来就压到 .12
      .sort((a, b) => CFG.dim(stars[b]) - CFG.dim(stars[a]))
      .slice(0, TWINKLE_MAX));

  const culled = CFG.cull || (() => false);
  for (const hip of used){
    const f = stars[hip];
    if (culled(f)) continue;              // 球背面，不建元素
    const [x, y] = project(f[0], f[1]);
    const below = !CFG.visible(f, tierV);
    if (below) lostCount++;

    const c = document.createElementNS(NS,'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y);
    c.setAttribute('r', starRadius(f));
    c.setAttribute('class', twinkling.has(hip) ? 'star twinkle' : 'star');
    c.style.setProperty('--o', below ? .12 : CFG.dim(f));
    const [dur, del] = CFG.phase(hip);
    c.style.setProperty('--dur', dur.toFixed(2) + 's');
    c.style.setProperty('--del', del.toFixed(2) + 's');
    /* 星图上这抹暗红的意思是「在你那儿它落到地平线以下，看不见」——
       是天象事实。概念图借了同一套渲染，于是「难度超出当前档」的概念
       也被涂成同一个红：入门档下 161 个概念里有 73 个是红的，
       近一半的图看起来像是报错或禁区。那不是这张图想说的话。
       颜色改由配置给：星图仍是红，概念图用一抹冷蓝，
       意思从「不可见」变回「更远处」。 */
    if (below) c.style.fill = CFG.belowFill || 'rgba(201,80,63,.5)';
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
      // 球面模式：折线只要有一端转到背面，整条就不画。
      // 只画一半会出现连到球外的直线，比缺一条更难看。
      if (line.some(h => culled(stars[h]))) continue;
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

    /* 星官名：放在成员星的重心。
       球面模式下重心只能按**看得见的那几颗**算 —— 一个半转过去的星官，
       按全体算出来的重心会落到球外面去。
       但 _members 必须是全体：检索、跳转、面板统计都靠它，
       按可见成员建集合的话，转个角度这些就跟着坏了。
       第一版这里直接 continue 掉了，_members 成了 undefined —— 检索当场炸。*/
    const all = g.lines.flat();
    const vis = all.filter(h => !culled(stars[h]));
    g._members = new Set(all);
    g._mini = null;
    g._label = null;
    if (!vis.length){ g._center = null; continue; }
    const cx = vis.reduce((s,h)=>s+project(...stars[h].slice(0,2))[0],0)/vis.length;
    const cy = vis.reduce((s,h)=>s+project(...stars[h].slice(0,2))[1],0)/vis.length;
    const t = document.createElementNS(NS,'text');
    t.setAttribute('x', cx); t.setAttribute('y', cy - 14);
    t.setAttribute('text-anchor','middle');
    t.setAttribute('class','gname');
    t.textContent = g.name;
    gName.appendChild(t);
    g._label = t;
    g._center = [cx, cy];

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

/* ── 小地球 ──────────────────────────────────────
   天球回答「你头顶上是什么」，这只小球回答「你站在哪」。
   两个问题挨着问才完整 —— 而且换观测地的时候，看得见球在转。

   正交投影，中心就是选中的那座城，所以那座城永远在正中。
   海岸线与中国疆域由数据给（web/geo.json，公版 Natural Earth 简化而来）；
   没有那份数据时只画经纬网 —— 三十七个地点的点本身就把中国的形状勾出来了，
   少了海岸线仍然认得出来，只是没那么好看。 */
const ER = 62;                                   // 小球半径（px）
function drawEarth(){
  if (!CFG.earth || !CFG.sites) return;
  let host = document.getElementById('earth');
  if (!host){
    host = document.createElementNS(NS, 'svg');
    host.id = 'earth';
    host.setAttribute('viewBox', `${-ER-16} ${-ER-16} ${(ER+16)*2} ${(ER+16)*2}`);
    document.body.appendChild(host);
  }
  host.innerHTML = '';
  const E = CFG.earth(site);
  const mk = (t, a, cls) => { const n = document.createElementNS(NS, t);
    for (const k in a) n.setAttribute(k, a[k]);
    if (cls) n.setAttribute('class', cls); return n; };

  host.appendChild(mk('circle', { r: ER }, 'eball'));

  // 经纬网。三十度一格，背面断开
  const grat = [];
  for (let lon = -180; lon < 180; lon += 30){
    let cur = [];
    for (let lat = -90; lat <= 90; lat += 3){
      const q = E.toXY(lat, lon, ER);
      if (q) cur.push(q); else if (cur.length){ grat.push(cur); cur = []; }
    }
    if (cur.length) grat.push(cur);
  }
  for (let lat = -60; lat <= 60; lat += 30){
    let cur = [];
    for (let lon = -180; lon <= 180; lon += 3){
      const q = E.toXY(lat, lon, ER);
      if (q) cur.push(q); else if (cur.length){ grat.push(cur); cur = []; }
    }
    if (cur.length) grat.push(cur);
  }
  const d = grat.filter(sg => sg.length > 1)
    .map(sg => 'M' + sg.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'))
    .join(' ');
  if (d) host.appendChild(mk('path', { d }, 'egrat'));

  // 海岸线与中国疆域。有就画，没有就算了 —— 这一块是可选的
  if (GEO){
    const pr = (la, lo) => E.toXY(la, lo, ER);
    const cd = segsToD(projectRings(GEO.land, pr));
    if (cd) host.appendChild(mk('path', { d: cd }, 'ecoast'));
    const nd = segsToD(projectRings(GEO.china, pr));
    if (nd) host.appendChild(mk('path', { d: nd }, 'echina'));
  }

  // 三十七个观测地。选中的那个是朱色，别的压得很淡
  E.sites.forEach((st, i) => {
    const q = E.toXY(st.lat, st.lon, ER);
    if (!q) return;
    host.appendChild(mk('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1),
      r: i === site ? 3.4 : 1.5 }, i === site ? 'ehere' : 'espot'));
  });

  // 选中那座城的光圈。转开之后它不再在正中，所以按投影位置画
  const here = E.toXY(E.site.lat, E.site.lon, ER);
  if (here) host.appendChild(mk('circle', { cx: here[0].toFixed(1),
    cy: here[1].toFixed(1), r: 9 }, 'ehalo'));
  const t = mk('text', { x: 0, y: ER + 14 }, 'elabel');
  // 转开之后标题要说清楚现在正对着的是哪儿，不然读的人以为球没动
  /* 转开之后标题要说清楚现在正对着哪儿，不然读的人以为球没动。
     经度归一到 ±180 再按东西经写 —— 「-154°E」不是中文的说法。 */
  if (E.drifted){
    const la = E.center.lat, lo = (E.center.lon % 360 + 540) % 360 - 180;
    t.textContent = `正对 ${la >= 0 ? '北纬' : '南纬'}${Math.abs(la).toFixed(0)}° `
                  + `${lo >= 0 ? '东经' : '西经'}${Math.abs(lo).toFixed(0)}°`;
  } else {
    t.textContent = CFG.sites[site].n;
  }
  host.appendChild(t);
  host.appendChild(mk('circle', { r: ER }, 'elimb'));
}

/* 地形是可选数据。取不到就只画经纬网，不报错、不重试 ——
   它是锦上添花，不该让一个网络抖动把整页拖住。
   {land: 陆地轮廓, china: 中国疆域}，都是扁平的 [lon,lat,lon,lat,…]。 */
let GEO = null;
fetch('geo.json', { cache: 'no-cache' })   // 跟 astrodata.json 一个口径：不带指纹，靠协商缓存
  .then(r => r.ok ? r.json() : null)
  .then(j => {
    if (!j || !j.land) return;
    GEO = j;
    if (CFG.VIEW && CFG.VIEW.mode === 'sphere'){ drawEarth(); build(); }
  })
  .catch(() => {});

/** 把一组扁平经纬折线投到某个平面上，背面断开。
    proj 给 [x,y] 或 null（表示这一点在背面）。 */
function projectRings(rings, proj){
  const segs = [];
  for (const poly of rings){
    let cur = [];
    for (let i = 0; i < poly.length; i += 2){
      const q = proj(poly[i + 1], poly[i]);
      if (q) cur.push(q);
      else { if (cur.length > 1) segs.push(cur); cur = []; }
    }
    if (cur.length > 1) segs.push(cur);
  }
  return segs;
}
const segsToD = segs => segs
  .map(sg => 'M' + sg.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'))
  .join(' ');

/* ── 转球 ────────────────────────────────────────
   为什么拖的时候画到 canvas，松手才回 SVG：量过。
   这张图有 3191 个要动的元素（1386 颗星、1386 个命中圈、419 条连线）。
     逐个改 cx/cy/d 再走一次布局：每帧 30–40 ms → 25 fps，拖起来是黏的
     同样数量画到 canvas，含三维旋转与背面剔除：每帧 0.4–2.5 ms
   差二十到四十倍。所以拖动期间盖一张 canvas 顶上去，SVG 藏起来；
   松手重建一次 SVG（约 40–50 ms，一次，看不出来），交互全回来。

   没上 WebGL：three.js 是 178 KB gzip、globe.gl 是 494 KB（都实测过），
   而这站最大的资源是 522 KB 的字体、GSAP 才 27 KB —— 为一个转球把体积
   翻一倍不划算，而 2D canvas 已经快到用不完。 */
let spinCv = null, spinning = false;

function ensureSpinCanvas(){
  if (spinCv) return spinCv;
  spinCv = document.createElement('canvas');
  spinCv.id = 'spin';
  document.body.insertBefore(spinCv, svg.nextSibling);
  return spinCv;
}

/** 拖动中的那一帧。只画星与连线 —— 名字与命中圈在这一帧不需要。 */
function paintSpin(){
  if (!DATA || !CUL) return;
  const cv = ensureSpinCanvas();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const r = svg.getBoundingClientRect();
  if (cv.width !== Math.round(r.width * dpr)){
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  // viewBox 到屏幕的换算，跟 svg 的 xMidYMid meet 一致
  const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const k = Math.min(cv.width / vb[2], cv.height / vb[3]);
  ctx.setTransform(k, 0, 0, k, cv.width / 2 - (vb[0] + vb[2] / 2) * k,
                                cv.height / 2 - (vb[1] + vb[3] / 2) * k);

  const stars = DATA.stars, tierV = CFG.tiers[site][1];
  const culled = CFG.cull || (() => false);
  /* 球的底与边缘。摊开的过程中它要淡出 ——
     摊平之后还顶着一个圆盘的话，那张图就还是球。 */
  const ballA = 1 - (CFG.VIEW ? CFG.VIEW.t : 0);
  if (ballA > 0.01){
    ctx.globalAlpha = ballA;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.86, 0, 6.2832);
    ctx.fillStyle = 'rgba(12,16,26,.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(232,226,212,.20)'; ctx.lineWidth = 1.1; ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = '#e8e2d4';
  for (const hip of spinPts){
    const f = stars[hip];
    if (culled(f)) continue;
    const [x, y] = project(f[0], f[1]);
    const fa = CFG.faceAlpha ? CFG.faceAlpha(f) : 1;
    if (fa <= 0) continue;
    ctx.globalAlpha = (CFG.visible(f, tierV) ? CFG.dim(f) : .12) * fa;
    ctx.beginPath(); ctx.arc(x, y, CFG.radius(f), 0, 6.2832); ctx.fill();
  }
  // 地影也要跟着画，不然一拖它就消失，而它正是要看的东西
  if (GEO && CFG.skyOf){
    /* 正面背面分两次画。
       纯拖球时背面那次 alpha=0，等于不画 —— 球不透明。
       摊开的那一秒里让它从零淡进来，系数跟星点的 faceAlpha 一样是 t×1.6：
       摊平之后地影是整张的，要是等最后 build() 一次补上，
       南海那一片会在末一帧凭空跳出来。 */
    const back = (CFG.morphing && CFG.morphing())
      ? Math.max(0, Math.min(1, (CFG.VIEW.t || 0) * 1.6)) : 0;
    const side = wantBack => (la, lo) => {
      const [ra, dec] = CFG.skyOf(la, lo, site);
      return (CFG.depth(ra, dec) > 0.015) === !wantBack
        ? CFG.project(ra, dec) : null;
    };
    const stroke = (rings, color, w, pr) => {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath();
      for (const sg of projectRings(rings, pr))
        sg.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.stroke();
    };
    for (const [wantBack, a] of [[false, 1], [true, back]]){
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      stroke(GEO.land,  'rgba(126,166,182,.34)', 1,   side(wantBack));
      stroke(GEO.china, 'rgba(212,97,79,.62)',  1.5, side(wantBack));
    }
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(217,180,95,.42)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  const morphing = CFG.morphing && CFG.morphing();
  for (const g of CUL.groups)
    for (const line of g.lines){
      // 过渡中不整条剔掉：连线要跟着一起摊开，断掉就看不出是同一张图了
      if (!morphing && line.some(h => culled(stars[h]))) continue;
      line.forEach((h, i) => {
        const [x, y] = project(...stars[h].slice(0, 2));
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
    }
  ctx.stroke();
}

let spinPts = [];
function bindSpin(){
  if (!CFG.rotatable) return;
  let drag = null, last = 0;
  const down = e => {
    /* 缩进着也能转 —— 这是天球该有的样子。
       上一版缩进之后拖动只是平移 viewBox，而球是有边的：
       拖到球缘就到头了，背面永远够不着。反馈说的
       「天球没法在放大的时候拖着旋转」就是这个。
       平面那张仍归 bindPan 平移：它没有背面，平移才对。 */
    if (!CFG.rotatable()) return;
    drag = { x: e.clientX, y: e.clientY, lon: CFG.VIEW.lon, lat: CFG.VIEW.lat };
    spinPts = [...CUL.groups].flatMap(g => [...g._members]);
    // 加上不属于任何星官的散星，不然转起来天是空的
    spinPts = [...new Set(spinPts.concat(Object.keys(DATA.stars)))];
    spinning = true;
    document.body.classList.add('spinning');
    paintSpin();
    // 捕获失败不该让整次拖拽作废（合成事件、某些触摸栈会抛）
    try { svg.setPointerCapture && svg.setPointerCapture(e.pointerId); } catch (_){}
  };
  const move = e => {
    if (!drag) return;
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    /* 每像素转多少度，不是随手定的 —— 由「球心那一点要跟住手指」反解：
         球心处转 1 弧度，画面上走 SR 个 viewBox 单位；
         1 个 viewBox 单位 = (屏幕短边 / viewBox 宽) 个像素。
       要让它走 1 像素，就得转 1/(SR·k) 弧度。
       上一版按屏幕宽度取 180°/短边，跟球多大没关系，于是球心处
       1 像素的手要跑出 1.43 像素 —— 拖起来球一直往前跑，抓不住。
       离球心越远仍会跟不上（绕轴转的球本来就这样，除非改成 arcball），
       但手感是由中间那块定的。 */
    const vbW = parseFloat(svg.getAttribute('viewBox').split(/\s+/)[2]) || R * 4.1;
    const k = Math.max(1, Math.min(r.width, r.height)) / vbW;
    const f = 180 / Math.PI / (R * 1.86 * k);
    /* 手感的定义：**你按住的是球上那一点，不是相机**。
       手往哪儿走，那一点就跟着往哪儿走。

       两个方向的符号是反的，这不是笔误。视线坐标转屏幕坐标时
       （sky.config.js 的 ortho）横向直接取用、竖向取了反：
           屏幕 x = +w[0]·SR      屏幕 y = −w[1]·SR
       所以「让点跟着手走」这一条要求，落到 lon 和 lat 上正好一加一减。

       上一版两个都是加号。那时球还是镜像的（横向也带负号），加号是对的；
       后来把球的左右镜像改回来，这里漏改了 —— 于是上下跟手、左右反着走。 */
    /* 横向还要再除一个 cos(纬度)：绕极轴转，球心那一点走的是**纬圈**，
       半径是 SR·cos(纬度)，不是 SR。少了这一下，在柏林（北纬 52.5°）
       横向只跟到 0.61 —— 实测正是 cos(52.52°)=0.608，一分不差。
       贴近极点 cos 趋于零，这一除会炸，所以夹在 0.2（约 78 度）。 */
    const cs = Math.max(0.2, Math.cos(drag.lat * Math.PI / 180));
    CFG.VIEW.lon = drag.lon - (e.clientX - drag.x) * f / cs;
    CFG.VIEW.lat = Math.max(-89, Math.min(89, drag.lat + (e.clientY - drag.y) * f));
    /* 按时间节流，不用 requestAnimationFrame。
       现代浏览器的 pointermove 本来就跟刷新率对齐（还会合并），
       再套一层 rAF 没有额外好处；而这个项目已经被「rAF 在隐藏标签页
       不触发」坑过三回，交互路径上能不依赖它就不依赖。
       12 ms 一次，约合八十帧，足够跟手。
       小地球跟着一起重画 —— 这正是「转的时候看得见对应的地标」。
       它两百来个元素，这个频率下不贵。 */
    if (movedEnough(e, drag)) panMoved = true;   // 松手那下的 click 要吞掉
    const now = performance.now();
    if (now - last < 12) return;
    last = now;
    paintSpin();
    drawEarth();
  };
  const up = () => {
    if (!drag) return;
    drag = null; spinning = false;
    document.body.classList.remove('spinning');
    build();                                   // 一次性重建，约 40–50 ms
    /* 缩进着转完，屏幕正中是谁就换成谁 —— 跟平面那边拖动的规矩一样。
       转到空处就维持原来那个，不然一拖就掉出去。 */
    if (sel){
      const g = centerGroup() || sel;
      open(g, NODEOF, 0, true);
    }
    setTimeout(() => { panMoved = false; }, 0);
  };
  svg.addEventListener('pointerdown', down);
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

/* ── 摊开／卷起的那一秒 ──────────────────────────
   过渡跑在 canvas 上，跟拖球同一个理由：三千一百多个元素逐帧改属性是
   30–40 ms 一帧，画到 canvas 是 0.4–2.5 ms。差二三十倍。
   过渡完再重建一次 SVG（40–50 ms，一次），交互全回来。

   时间轴分两段，先后顺序由几何定（见 sky.config.js 里 morph 的注释）：
     0 → 0.42   转正：视线纬度挪到 90°，北天极对着你
     0.42 → 1   摊开：半径从 SR·cos(赤纬) 拉成 2R·(90−赤纬)/180
   卷起来把这两段倒过来跑。

   不用 requestAnimationFrame 之外的东西，但也不指望它：
   隐藏标签页里 rAF 不触发，那时直接落位，不演。 */
const MORPH_MS = 1150;
let morphing = false;

function easeInOut(x){ return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2; }

function runMorph(toSphere, done){
  const V = CFG.VIEW;
  if (!V || morphing){ done(); return; }
  // 后台标签页里没有动画可言，直接落位
  if (document.hidden){ V.t = 0; V.mlat = null; V.mir = null; done(); return; }
  morphing = true;
  document.body.classList.add('spinning');       // 借它藏 SVG、亮 canvas
  const lat0 = V.lat;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / MORPH_MS);
    // 摊开时 0→1，卷起时 1→0
    const p = toSphere ? 1 - k : k;
    if (p < .42){
      /* 转正段：视线纬度推到 90，同时把左右换过来 ——
         球是从外面看（东在右），平面是抬头看（西在右），中间必须翻面。
         放在这一段做：它本来就在转，多一个翻面不突兀；
         到摊开那一段手已经换好，摊开仍是纯粹的径向拉伸。 */
      const q = easeInOut(p / .42);
      V.mlat = lat0 + (90 - lat0) * q;
      V.mir = q;
      V.t = 0;
    } else {
      V.mlat = 90; V.mir = 1;
      V.t = easeInOut((p - .42) / .58);
    }
    paintSpin();
    if (k < 1) requestAnimationFrame(step);
    else {
      V.t = 0; V.mlat = null; V.mir = null;
      morphing = false;
      document.body.classList.remove('spinning');
      done();
    }
  };
  requestAnimationFrame(step);
  // rAF 万一不触发（隐藏标签页切回来之前），兜一手别把页面卡在过渡态
  setTimeout(() => {
    if (!morphing) return;
    V.t = 0; V.mlat = null; V.mir = null; morphing = false;
    document.body.classList.remove('spinning');
    done();
  }, MORPH_MS + 900);
}

/* ── 抬头日签 ────────────────────────────────────
   跟出生星空卡同一套版式（card.js），换一套内容：
   今天的日子、今晚这个观测地头顶上的天、以及此刻最高的那个星官。

   为什么值得做：星图这一页平时是「看一张古图」，日签把它变成
   「今晚出门抬头能看见什么」—— 后者是有人会发出去的。

   时刻取当地二十一点。不是随手定的：那时天已经黑透，
   而大多数人还没睡。 */
/** startAt 给了就以那一天为基准 —— 从星盘或紫微带日子过来时走这条。 */
async function makeDaily(startAt){
  const host = document.getElementById('cardhost');
  const box = document.getElementById('cardbox');
  box.classList.add('on');
  host.innerHTML = '<div id="cardwait">正 在 排 今 晚 …</div>';
  const [EPH, LUN, CARD, BIRTH] = await Promise.all([
    import('./ephem.js?v=e6ac781a'),
    import('./lunar.js?v=6a22c0e6'),
    import('./card.js?v=d3c8a0a8'),
    import('./birth.js?v=af8e9281'),
  ]);
  await CARD.ready();

  const st = CFG.sites[site];
  const tz = st.tz == null ? 8 : st.tz;
  /* 「今天」按**观测地**的时区算，不按看的人所在的时区。
     人在北京看柏林的天，日期该是柏林那边的日期。 */
  const now = new Date();
  const there = new Date(now.getTime()
    + (tz * 60 + now.getTimezoneOffset()) * 60000);
  const TODAY = { y: there.getFullYear(), m: there.getMonth() + 1, d: there.getDate() };
  /* 轴的基准日。锚点和滚轮改的是它，轴本身永远是「基准前后各半年」——
     一根滑杆没法既跨一百年又拨得动一天，所以粗跳交给锚点和滚轮，
     细拨交给轴。 */
  let base = startAt && startAt.y ? { ...startAt } : { ...TODAY };
  const dayOf = off => { const d = new Date(base.y, base.m - 1, base.d + off);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };

  const rad = x => x * Math.PI / 180;
  const altOf = (ra, dec, lst) => {
    const H = rad(lst - ra), dd = rad(dec), phi = rad(st.lat);
    return Math.asin(Math.max(-1, Math.min(1,
      Math.sin(dd) * Math.sin(phi) + Math.cos(dd) * Math.cos(phi) * Math.cos(H))))
      * 180 / Math.PI;
  };
  const withLore = DATA.cultures.cn.groups.filter(g => DATA.lore && DATA.lore[g.name]);
  const SEVEN = ['月亮', '金星', '火星', '木星', '土星'];

  /** 给定「距今天多少天」，排出那一晚的一整张卡。
      整张重画实测 2 毫秒上下，所以拖的时候这里每帧都会跑一次。 */
  const specAt = off => {
    const [y, mo, d] = dayOf(off);
    const c = EPH.compute(y, mo, d, 21, tz, st.lat, st.lon);   // 当地二十一点
    const L = LUN.toLunar(Date.UTC(y, mo - 1, d, 21 - tz, 0));

    // 那一晚哪个星官最高。取有讲解的那些，算成员星的平均高度。
    let top = null;
    for (const g of withLore){
      const hs = [...new Set(g.lines.flat())];
      let s2 = 0, n = 0;
      for (const h of hs){
        const f = DATA.stars[h]; if (!f) continue;
        s2 += altOf(f[0], f[1], c.ramc); n++;
      }
      if (n && (!top || s2 / n > top.a)) top = { g, a: s2 / n };
    }
    const lore = top ? String(DATA.lore[top.g.name]).replace(/<[^>]+>/g, '') : '';
    const upNow = SEVEN.filter(n => altOf(c.bodies[n].ra, c.bodies[n].dec, c.ramc) > 0);

    return {
      square: true,
      title: '抬 头 日 签',
      side: '当 地 二 十 一 时',
      big: `${CARD.cnDigits(y)}年${CARD.cnSmall(mo)}月${CARD.cnSmall(d)}日`,
      sub: [
        L ? `农历 ${L.leap ? '闰' : ''}${CARD.CN_M[L.month]}月${CARD.CN_D[L.day]}` : '',
        `${st.n}　${st.lat >= 0 ? '北纬' : '南纬'}${Math.abs(st.lat).toFixed(2)}°`,
      ].filter(Boolean),
      quote: top
        ? `${off === 0 ? '今晚抬头' : '这一晚'}，${top.g.name}正在你头顶 `
          + `${top.a.toFixed(0)} 度高处。` + (lore ? lore.slice(0, 46) : '')
        : '',
      fine: [
        upNow.length ? `入夜时在地平线以上：${upNow.join('、')}`
                     : '这一晚五星与月都在地平线以下',
        `当地恒星时 ${(c.ramc / 15).toFixed(2)}h　儒略日 ${c.jd.toFixed(4)}`,
      ],
      stance: '位置是算的，说法是传统的',
      sky: { lst: c.ramc, lat: st.lat, stars: DATA.stars,
             groups: DATA.cultures.cn.groups.slice(0, 120).map(g => g.lines),
             bodies: SEVEN.map(n => [n, c.bodies[n]]) },
    };
  };

  /* 轴取今天前后各半年。同一个钟点，一年里天正好转一圈 ——
     拨着看，就看得见「同样是二十一点，冬天和夏天不是同一片天」。 */
  const same = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;
  const api = CARD.mount(host, {
    from: -182, to: 182, step: 1, value: 0,
    spec: specAt,
    name: off => { const [y, mo, d] = dayOf(off);
      return `日签_${y}${String(mo).padStart(2,'0')}${String(d).padStart(2,'0')}.png`; },
    mark: off => {
      const [y, mo, d] = dayOf(off);
      if (off === 0 && same(base, TODAY)) return '今 晚';
      const s = `${y}年${mo}月${d}日`;
      return off === 0 ? s : `${s}　${off > 0 ? off + ' 天后' : -off + ' 天前'}`;
    },
    homeText: '回 到 基 准 日',
    axisLabel: '拨到哪一晚',
    alt: '抬头日签',
  });

  /* ── 视觉指引：这张卡是拿来对照的 ──────────────────
     一张「今晚的天」本身说不出什么。**它得有个对照面**：
     你出生那天头顶是什么样，今晚又是什么样 —— 同一片天，隔着你这一生。
     所以两个锚点摆在轴下面，一句话把这件事说破。

     生辰从本机那份记录来（birth.js），跟星盘、紫微共用一份 ——
     在那两页填过的日子，到这儿直接就能对照，不用再填一遍。
     没填过就不摆这个锚点，改成一句「去星盘填一次」，别摆个点了没用的钮。 */
  const B = BIRTH.load();
  const guide = document.createElement('div');
  guide.className = 'cardguide';
  guide.textContent = B ? '你出生那天的天，和今晚的天' : '拨到任意一天，看那一晚头顶是什么样';
  const anchors = document.createElement('div');
  anchors.className = 'cardanchor';

  const goto_ = to => { base = { ...to }; api.jump(0); mark(); };
  const chips = [];
  const chip = (label, to, title) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'canch'; b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', () => goto_(to));
    chips.push([b, to]); anchors.appendChild(b);
    return b;
  };
  if (B) chip('出 生 那 天', { y: B.y, m: B.m, d: B.d },
              `${B.y} 年 ${B.m} 月 ${B.d} 日`);
  chip('今 晚', TODAY);
  const pickBtn = document.createElement('button');
  pickBtn.type = 'button'; pickBtn.className = 'canch canch-pick';
  pickBtn.textContent = '挑 一 天';
  anchors.appendChild(pickBtn);
  if (!B){
    const a2 = document.createElement('a');
    a2.className = 'cardlink'; a2.href = 'astro.html';
    a2.textContent = '填过生辰就能跟出生那天对照 →';
    anchors.appendChild(a2);
  }
  const mark = () => chips.forEach(([b, to]) => b.classList.toggle('on', same(base, to)));
  mark();

  const axis = host.querySelector('.cardaxis');
  axis.appendChild(guide);
  axis.appendChild(anchors);

  // 滚轮按需出现 —— 默认不占地方，点「挑一天」才展开
  let wheelBox = null, wheelApi = null;
  pickBtn.addEventListener('click', () => {
    if (wheelBox){ wheelBox.classList.toggle('on'); return; }
    wheelBox = document.createElement('div');
    wheelBox.className = 'cwbox on';
    axis.appendChild(wheelBox);
    // 滚轮内部用 y/mo/d，base 用 y/m/d —— 在这条边界上转一次，别让两套键混进去
    wheelApi = CARD.wheel(wheelBox, { y: base.y, mo: base.m, d: base.d },
      v => { base = { y: v.y, m: v.mo, d: v.d }; api.jump(0); mark(); });
  });

  const bar = host.querySelector('.cardbar');
  CARD.shareBar(bar, api, { title: '抬头日签 · 星图',
    text: '这一晚头顶的天。' + location.origin + location.pathname });
}

/* ── 缩进之后拖着看 ──────────────────────────────
   点进一个星官之后，原来只能退回全天再点下一个。
   现在可以直接拖：上下左右挪视野，**屏幕正中是谁，就自动亮谁**。
   这比「退出去再点」顺得多 —— 星官本来就是挨着的，
   看完仙女座顺手往右一推就是英仙座，那正是在天上找星的样子。

   实现上两件事要小心：

   一、**平移只改 viewBox 的 x/y，不改 w/h**，所以缩放级别不变，
       而且一帧只写一个属性 —— 不需要像转球那样走 canvas。
   二、**拖完那一下的 click 要吞掉**。不吞的话松手会触发 svg 的点击，
       pick 到另一个星官再 open 一次，把刚拖到的位置又拽走。 */
let panning = false, panMoved = false;

/* 「这一下算点还是算拖」的分界，单位是屏幕像素。
   拖完松手会紧接着来一个 click，不吞掉的话它会当场再打开一个别的星官；
   可门槛设窄了，正常的点击也会被当成拖。

   上一版写的是曼哈顿距离 > 4。太紧了：鼠标点击本身就带两三像素抖动，
   **手指点击通常要移五到十五像素** —— 于是手机上点天球基本打不开东西。
   反馈原话是「天球那个界面似乎不能点击放大」，就是这条。
   （而我上次验证只发了 pointerdown + pointerup，中间一次 pointermove 都没有，
     所以测出来是通的。测法不代表真实操作。）

   改成欧氏距离，并且分设备取值：鼠标 8，触摸 14 ——
   跟浏览器自己判定拖拽起点用的量级一致。 */
const dragSlop = () => matchMedia('(hover: none)').matches ? 14 : 8;
const movedEnough = (e, from) =>
  Math.hypot(e.clientX - from.x, e.clientY - from.y) > dragSlop();

/** 屏幕正中最近的那个星官。太远就不换 —— 拖到空处不该乱跳。 */
function centerGroup(){
  if (!CUL) return null;
  const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
  const lim = vb[2] * 0.5;
  let best = null, bd = Infinity;
  for (const g of CUL.groups){
    if (!g._center) continue;                       // 转到球背面去了
    /* 也要有线可点亮。天球上贴着边缘的星官，成员有一半在背面，
       连线整条不画 —— 切过去屏幕上什么都不亮，看着像没反应。 */
    if (!g._paths || !g._paths.length) continue;
    const d = Math.hypot(g._center[0] - cx, g._center[1] - cy);
    if (d < bd){ bd = d; best = g; }
  }
  return bd < lim ? best : null;
}

function bindPan(){
  let drag = null, last = 0;
  const down = e => {
    if (!sel) return;                    // 只在缩进状态下平移；全天图归转球管
    // 天球缩进之后归转球管：球有背面，平移到球缘就到头了
    if (CFG.rotatable && CFG.rotatable()) return;
    const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number);
    drag = { x: e.clientX, y: e.clientY, vb };
    panning = true; panMoved = false;
    document.body.classList.add('panning');
    try { svg.setPointerCapture && svg.setPointerCapture(e.pointerId); } catch (_){}
  };
  const move = e => {
    if (!drag) return;
    e.preventDefault();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (movedEnough(e, drag)) panMoved = true;
    const r = svg.getBoundingClientRect();
    // 屏幕像素换算成 viewBox 单位。meet 拟合下比例由较小的那一边定。
    const k = drag.vb[2] / Math.max(1, Math.min(r.width, r.height));
    setVB([drag.vb[0] - dx * k, drag.vb[1] - dy * k, drag.vb[2], drag.vb[3]]
          .map(n => n.toFixed(1)).join(' '));
    // 换选中不必每帧都做，九十毫秒一次够跟手了，也省下一次全量重排
    const now = performance.now();
    if (now - last < 90) return;
    last = now;
    const g = centerGroup();
    if (g && g !== sel) open(g, NODEOF, 0, true);
  };
  const up = () => {
    if (!drag) return;
    drag = null; panning = false;
    document.body.classList.remove('panning');
    const g = centerGroup();
    if (g && g !== sel) open(g, NODEOF, 0, true);
    // 松手那一下的 click 紧接着来，得留个标记让它自己退出
    setTimeout(() => { panMoved = false; }, 0);
  };
  svg.addEventListener('pointerdown', down);
  addEventListener('pointermove', move, { passive: false });
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

/* ── 滚动到头看得出来 ────────────────────────────
   侧栏实测 scrollHeight 1025、clientHeight 900 —— 底下还压着 125 像素
   的内容，而屏幕上没有任何迹象。反馈说「要让人感觉滚动是有尽头的」。

   做法是两端各一道渐隐：**还有内容的那一头才画**，滚到头它就退掉。
   这比一条常驻的滚动条说得更准 —— 它说的不是「这里能滚」，
   而是「这个方向还有」。纯 CSS 做不到「还有没有」，所以这一小段 JS。 */
const edgeUpd = [];
function scrollEdges(root = document){
  for (const el of root.querySelectorAll('.scrollend')){
    if (el.dataset.edged) continue;                 // 只装一次
    el.dataset.edged = '1';
    const upd = () => {
      const more = el.scrollHeight - el.clientHeight - el.scrollTop;
      el.classList.toggle('more-up', el.scrollTop > 4);
      el.classList.toggle('more-down', more > 4);
    };
    edgeUpd.push(upd);
    el.addEventListener('scroll', upd, { passive: true });
    addEventListener('resize', upd);
    /* 内容是后填的（星官清单要等数据到）。
       ResizeObserver 只盯**容器**没用：容器是定高的，内容长高它不触发。
       第一版就是这么写的，装上去一直没亮。盯里面那层。 */
    if (window.ResizeObserver){
      const ro = new ResizeObserver(upd);
      ro.observe(el);
      for (const c of el.children) ro.observe(c);
    }
    upd();
  }
}
/** 内容换过之后叫一声。星官清单会随中西切换整片重排。 */
function refreshEdges(){ for (const f of edgeUpd) f(); }

/** 平面／天球切换。只有星图有，概念图那份配置里没有 VIEW。 */
function bindView(){
  if (!CFG.VIEW) return;
  /* 放进 #bar 当直接子元素，不要塞进 #where ——
     #where 里已经有「几颗永不升起」「来源」「观测地」三样，
     再挤一个分段控件，375px 的屏上它会顶出屏外。
     当成 bar 的子元素，flex-wrap 会自己换行。 */
  const seg = document.createElement('div');
  seg.className = 'seg viewseg';
  const sph = CFG.VIEW.mode === 'sphere';
  seg.innerHTML = `<button data-v="flat"${sph ? '' : ' class="on"'}>平 面</button>`
                + `<button data-v="sphere"${sph ? ' class="on"' : ''}>天 球</button>`;
  document.body.classList.toggle('sphere', sph);
  const bar = document.getElementById('bar');
  const cultSeg = bar.querySelector(':scope > .seg');
  bar.insertBefore(seg, cultSeg ? cultSeg.nextSibling : bar.lastElementChild);
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.classList.contains('on')) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    if (sel) close();
    const toSphere = b.dataset.v === 'sphere';
    /* 先演，再换模式。顺序不能反：过渡是从「现在这张」变到「那张」，
       模式提前改了，第一帧就已经是终点了。 */
    if (toSphere && CFG.faceSite && CFG.sites)
      CFG.faceSite(CFG.sites[site].lat, site);
    if (CFG.VIEW.mode === (toSphere ? 'sphere' : 'flat')){
      document.body.classList.toggle('sphere', toSphere);
      build();
      return;
    }
    // 过渡期间两头的坐标都要算得出来，所以先把模式设成球（morph 以它为基准）
    CFG.VIEW.mode = 'sphere';
    runMorph(toSphere, () => {
      CFG.VIEW.mode = toSphere ? 'sphere' : 'flat';
      document.body.classList.toggle('sphere', toSphere);
      build();
    });
  });
}

// 点击只注册一次。它原来写在 build() 里面，于是每切一次中西就多挂一个
// 监听器，而旧的那个闭包还抓着旧 culture —— 先注册的先跑，后面的撞上
// `if (sel) return` 直接退出。症状：切到西方，点猎户座，弹出「参宿」。
/** 离这一点最近的那一组，limPx 是**屏幕像素**的容差。
 *  阈值必须换算：放大之后 40 个 SVG 单位会占掉半个屏，
 *  那样点哪儿都命中；缩小时又小得点不着。 */
function pickAt(pt, limPx){
  if (!CUL) return null;
  const vbw = +svg.getAttribute('viewBox').split(/\s+/)[2];
  const lim = limPx * vbw / Math.max(1, svg.getBoundingClientRect().width);
  /* 背面的星不算 —— 天球是不透明的，投影又不是一一对应：
     背面一颗星可能正好投到你手指底下。所以要按**星**剔，不是按星官剔。
     上一版是按星官剔的（「一条线都没画出来就跳过」），
     可天球上有十八个星官是「星看得见、线一条都画不出来」——
     一条连线只要有一颗成员转到背面就整条不画，而北斗、天市左垣
     这些跨度大的最容易中招（天市左垣有十颗在正面）。
     结果就是：星明明在那儿，点上去没反应。 */
  const culled = CFG.cull || (() => false);
  let best = null, bd = 1e9;
  for (const g of CUL.groups){
    for (const h of g._members){
      const f = DATA.stars[h];
      if (!f || culled(f)) continue;
      const [x, y] = project(f[0], f[1]);
      const d = Math.hypot(x - pt.x, y - pt.y);
      if (d < bd){ bd = d; best = g; }
    }
  }
  return bd < lim ? best : null;
}

// 手指的落点比鼠标散，点击容差放宽。安全：上面永远取最近的那一组，
// 容差只决定「这一下收不收」，放宽不会让它更容易点错组，只会少漏几下。
const CLICK_LIM = () => matchMedia('(hover: none)').matches ? 36 : 26;
function pick(e){ return pickAt(svgPoint(e), CLICK_LIM()); }

svg.addEventListener('click', e => {
  if (!CUL) return;
  if (panMoved) return;          // 刚拖过，这一下不是「点」
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

/* ── 扫过就亮 ─────────────────────────────────────
   原来只有一条命中带：每组连线合成一条透明粗线（.linkhit，笔宽 11）。
   全天图上 viewBox 1558 铺在 800 像素上，11 个单位折成屏幕上 5.6 像素 ——
   离连线两三个像素之外就没反应了，反馈说的「识别区域有点小」就是这个。
   加宽命中带治不了根：星官之间本来就有大片空处，加宽只会让相邻两组抢。

   改成跟点击同一套判法：**离哪一组最近就亮哪一组**，容差给得比点击宽。
   这样星官周围一整片都有反应，而且不会抢 —— 最近的只有一个。
   全扫一遍是 1550 颗星的距离比较，实测在一次 mousemove 的预算里绰绰有余。 */
const HOVER_LIM = 64;              // 屏幕像素。点击那条是 26
function bindHover(){
  if (matchMedia('(hover: none)').matches) return;   // 触摸设备没有悬停
  let last = 0;
  svg.addEventListener('mousemove', e => {
    if (sel || spinning || panning) return;
    const now = performance.now();
    if (now - last < 24) return;                     // 一帧一次够了
    last = now;
    const g = pickAt(svgPoint(e), HOVER_LIM);
    if (g){ hoverGroup(g, e); hoverMove(e); }
    else if (hoverG) unhoverGroup();
  });
  svg.addEventListener('mouseleave', () => { if (hoverG) unhoverGroup(); });
}

let firstVisit = false;
let hoverG = null;
function hoverGroup(g, e){
  if (sel) return;                                  // 点开之后不再抢注意力
  if (hoverG === g) return;
  unhoverGroup();
  hoverG = g;
  g._paths.forEach(q => q.classList.add('lit'));
  if (g._label) g._label.classList.add('lit');
  ensureFig(g)?.classList.add('on');
  showCard(g, e);
}
/** 已经亮着的时候，卡片跟着鼠标走 —— 扫过就亮之后这一步归 bindHover 管。 */
function hoverMove(e){ if (hoverG) moveCard(e); }
function unhoverGroup(){
  if (!hoverG) return;
  hoverG._paths.forEach(q => q.classList.remove('lit'));
  if (hoverG._label) hoverG._label.classList.remove('lit');
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

function open(g, nodeOf, ms = 900, noFrame = false){
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
  if (!noFrame) frameOn(cx, cy, sz, ms);

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
  /* 平移中切过来的不等生长动画：手还在动，等一秒半才出名字就断了。
     正常点进来的仍然等 —— 那一刻的「连完线再浮出」是这一页的招牌。 */
  const reveal = () => {
    if (g._label) g._label.classList.add('show');
    ensureFig(g)?.classList.add('on');
    showPanel(g);
    markChips();
  };
  if (noFrame) reveal();
  else revealT = setTimeout(reveal, g._total * 1000 + 320);
}

function close(){
  if (!sel) return;
  clearTimeout(revealT);
  hideCard();
  const g = sel; sel = null;
  document.body.classList.remove('open');
  svg.classList.remove('zoomed');
  document.getElementById('panel').classList.remove('show');
  if (g._label) g._label.classList.remove('show');
  g._paths.forEach(p => p.classList.remove('draw','armed'));
  document.querySelectorAll('.link').forEach(p => p.classList.remove('other'));
  document.querySelectorAll('.star').forEach(n => n.classList.remove('member','dimmed'));
  document.querySelectorAll('.fig').forEach(f => f.classList.remove('on'));
  frameOn(0, 0, R * 4.1 * 1.06, 780);   // 稍微放宽，让检索栏不吃掉外规
  markChips();
}

/** 把 (cx,cy) 摆到实际看得见那块区域的中心。
 *  左边压着检索栏、下边压着讲解面板，按视口正中对齐会让星官藏在栏底下。
 *  换算按 preserveAspectRatio="xMidYMid meet" 的实际投影公式来，不是估的：
 *      screen_x = (x - vx) * scale + (W - size*scale) / 2
 */
/* ── 画面上真正空着的那一块 ────────────────────────
   svg 铺满整个窗口，preserveAspectRatio 又是 xMidYMid ——
   于是天球永远按**窗口**居中。可窗口左边压着 212 宽的侧栏、
   上面压着顶栏、下面压着那行提示，实际空着的不是整个窗口。

   1440×900 下实测：天球圆心落在 x=720，而侧栏右缘之后的可用区中心
   是 826 —— 偏左 106 像素，左边离侧栏只剩 100，右边空着 312。
   反馈说的「电脑上打开要考虑居中」就是这个。

   这里量出真正空着的那块，全天图和缩进都按它摆。
   量的是实际 DOM，不是写死的 212 —— 侧栏收起、换断点，跟着就对。 */
function freeBox(){
  const W = innerWidth, H = innerHeight;
  /* 「这东西在不在」不能用 offsetParent 判 ——
     position:fixed 的元素 offsetParent 恒为 null，而这三样全是 fixed。
     第一版就是这么写的：三个都算成 0，可用区又变回整个窗口，白改。
     用它有没有实际盒子来判。 */
  const px = (sel, f) => { const e = document.getElementById(sel);
    if (!e || !e.getClientRects().length) return 0;
    const r = e.getBoundingClientRect();
    return (r.width < 1 || r.height < 1) ? 0 : f(r);
  };
  const left = document.body.classList.contains('rail-off') ? 0
             : px('rail', r => Math.max(0, r.right));
  const top = px('bar', r => Math.max(0, r.bottom));
  const bot = px('hint', r => Math.max(0, H - r.top));
  return { x: left, y: top,
           w: Math.max(1, W - left), h: Math.max(1, H - top - bot) };
}

/** 全天图的 viewBox：仍是那个 R*4.1 的方框，只是挪到可用区的正中。 */
function fullVB(){
  const size = R * 4.1;
  const W = innerWidth, H = innerHeight;
  if (!W || !H) return `${-R*2.05} ${-R*2.05} ${size} ${size}`;
  const k = Math.min(W, H) / size;                 // meet 拟合，短边说了算
  const f = freeBox();
  const dx = (f.x + f.w / 2 - W / 2) / k;          // 屏幕像素折回 viewBox 单位
  const dy = (f.y + f.h / 2 - H / 2) / k;
  return `${-size / 2 - dx} ${-size / 2 - dy} ${size} ${size}`;
}

function frameOn(cx, cy, size, ms){
  const W = innerWidth, H = innerHeight;
  const scale = Math.min(W, H) / size;
  const f = freeBox();
  const tx = f.x + f.w / 2, ty = f.y + f.h / 2;
  const vx = cx - (tx - (W - size * scale) / 2) / scale;
  const vy = cy - (ty - (H - size * scale) / 2) / scale;
  animateViewBox(vx, vy, size, size, ms);
}

/* 图上的字要保持屏幕上的大小不变。
   全天图的 viewBox 是 1558 单位见方，桌面上按高度铺满只有 0.46 倍 ——
   写 8px 的圈注在屏幕上就是 3.7px，星官名 13px 是 6px。
   反馈「字有点太小」，最小的一批在这儿。
   直接把 px 写大，缩进去看某一个星官时又会大得离谱（缩放能到四倍）。
   所以每次 viewBox 一变就重算一个倒数系数写进 --sfs，
   CSS 那边用 calc(Npx * var(--sfs)) —— 无论缩放到哪一档，
   屏幕上的字号恒定。 */
function setVB(v){
  svg.setAttribute('viewBox', v);
  const [, , w] = v.split(/\s+/).map(Number);
  /* 不能用 clientWidth：那是 HTMLElement 的属性，svg 元素上恒为 0 —— 
     第一版就是这么写的，--sfs 直接算成了 Infinity 再退回 1。
     getBoundingClientRect 对 svg 有效。 */
  const r = svg.getBoundingClientRect();
  const k = Math.min(r.width, r.height) / w;
  // 量不到尺寸时（页面还没布局、或窗口是 0）什么都不写，
  // 让 CSS 里那个全天图档位的缺省值顶上，别覆盖成 1。
  if (k > 0) svg.style.setProperty('--sfs', (1 / k).toFixed(3));
}

let vbAnim = null;
function animateViewBox(x, y, w, h, ms){
  // rAF 在隐藏标签页里不触发；这里保底直接落位，可见时才逐帧补间
  if (document.hidden){ setVB([x,y,w,h].map(n=>n.toFixed(1)).join(' ')); return; }
  const cur = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const t0 = performance.now();
  if (vbAnim) cancelAnimationFrame(vbAnim);
  const ease = t => 1 - Math.pow(1 - t, 3);
  const step = now => {
    const t = Math.min(1, (now - t0) / ms), k = ease(t);
    const v = cur.map((c, i) => c + ([x,y,w,h][i] - c) * k);
    setVB(v.map(n=>n.toFixed(1)).join(' '));
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
/* 必须限定成 #bar 的直接子元素。「平面／天球」那组也是 .seg（借同一套样式），
   不限定的话点它会把 culture 设成 undefined，DATA.cultures[undefined].groups
   当场抛错 —— build() 死在三规之后、星点之前，屏幕上只剩三个圈。
   星盘页加「口吻」开关时踩过一模一样的坑，这是第二次。 */
document.querySelectorAll('#bar > .seg:not(.viewseg) button').forEach(b => {
  b.addEventListener('click', () => {
    if (sel) close();
    document.querySelectorAll('#bar > .seg:not(.viewseg) button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    culture = b.dataset.c;
    document.getElementById('hint').textContent = hintText();
    build();
  });
});
}

const sel_site = document.getElementById('site');
CFG.tiers.forEach(([n], i) => {
  const o = document.createElement('option');
  o.value = i; o.textContent = n; sel_site.appendChild(o);
});
/* 记住上次看的是哪儿。存的是**城市名**不是下标 ——
   下标会随地点表增删而漂，名字不会。
   这不是身份信息，就是「上次翻到哪一页」。 */
const SITE_KEY = 'xingtu-site';
try {
  const want = localStorage.getItem(SITE_KEY);
  if (want && CFG.sites){
    const i = CFG.sites.findIndex(s => s.city === want);
    if (i >= 0){
      site = i;
      if (CFG.faceSite) CFG.faceSite(CFG.sites[i].lat, i);
    }
  }
} catch (_){}                       // 隐私模式下 localStorage 会抛
sel_site.value = site;
/* 下拉前面补一个标签。原来右上角只有一个写着「北京」或「入门」的选择框，
   它到底在筛什么，界面上没有任何字说明 —— 概念图上尤其费解。 */
if (CFG.text.siteLabel){
  const lb = document.createElement('span');
  lb.className = 'sitelab';
  lb.textContent = CFG.text.siteLabel;
  sel_site.parentNode.insertBefore(lb, sel_site);
}
sel_site.addEventListener('change', () => {
  if (sel) close();
  site = +sel_site.value;
  /* 天球模式下换观测地，把球转到那座城的天顶 ——
     天顶的赤纬恰好等于当地纬度，所以「把这座城摆到中间」有精确的意思。 */
  /* 两种模式都要重设锚点。平面那张虽然不按观测地居中（它是绕北天极的
     等距方位投影，中心永远是天极 —— 这是这张图的形制，不是没做），
     但**地影那一层是按观测地锚定的**：不重设的话，切了城市之后
     那层地还挂在上一座城上，看着就是「选的地方不对」。 */
  if (CFG.faceSite && CFG.sites) CFG.faceSite(CFG.sites[site].lat, site);
  try { if (CFG.sites) localStorage.setItem(SITE_KEY, CFG.sites[site].city); } catch (_){}
  build();
});

bindSpin();
bindPan();
bindHover();
bindView();
scrollEdges();

/* 日签的入口。只有星图有 —— 概念图没有观测地，也没有「今晚」。 */
if (CFG.sites){
  const b = document.createElement('div');
  b.id = 'dailybtn'; b.textContent = '抬 头 日 签';
  document.body.appendChild(b);
  b.addEventListener('click', () => makeDaily());
  const box = document.createElement('div');
  box.id = 'cardbox';
  box.innerHTML = '<div class="cbin"><div id="cardclose">关</div>'
                + '<h3>抬 头 日 签</h3><div id="cardhost"></div></div>';
  document.body.appendChild(box);
  document.getElementById('cardclose')
    .addEventListener('click', () => box.classList.remove('on'));
  box.addEventListener('click', e => {
    if (e.target === box) box.classList.remove('on');
  });
}

addEventListener('resize', () => {
  if (!sel) build();
  else setVB(svg.getAttribute('viewBox'));   // 缩进状态下只要改系数
});

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
    document.querySelectorAll('#bar > .seg:not(.viewseg) button')
      .forEach(b => b.classList.toggle('on', b.dataset.c === culture));
    document.getElementById('hint').textContent = hintText();
    build();
  }
  const g = CUL && CUL.groups.find(x => x.name === name);
  if (g) faceGroup(g, () => { open(g, NODEOF, sel ? 1150 : 900); markChips(); });
  else markChips();
}

/** 这一组在天上的平均方向。取成员星单位向量的和再归一 ——
    不能对赤经取算术平均：跨过 0 度那些会平均到对面去。 */
function groupAim(g){
  let x = 0, y = 0, z = 0;
  for (const h of g._members){
    const f = DATA.stars[h]; if (!f) continue;
    const t = f[0] * Math.PI / 180, q = f[1] * Math.PI / 180;
    x += Math.cos(q) * Math.cos(t); y += Math.cos(q) * Math.sin(t); z += Math.sin(q);
  }
  const r = Math.hypot(x, y, z) || 1;
  return [Math.atan2(y, x) * 180 / Math.PI,
          Math.asin(Math.max(-1, Math.min(1, z / r))) * 180 / Math.PI];
}

/* ── 先把球转过去，再放大 ──────────────────────────
   从侧栏或检索里挑一个星官，它可能正在球的背面。上一版直接缩进：
   viewBox 是推过去了，可那块天被球身挡着，屏幕上什么都没有。
   反馈举的例子是天蝎 —— 它跟中国正好隔着地球。

   所以先转。转到位之后那一组落在球心附近，缩进的窗口也就框在球心，
   接着拖动继续转，天从窗口底下流过去 —— 这一串是一件事。
   平面那张不用转：它没有背面，整张天一次摊完。 */
function faceGroup(g, done){
  if (!CFG.VIEW || !CFG.rotatable || !CFG.rotatable() || !CUL){ done(); return; }
  const [tl, tb] = groupAim(g);
  const l0 = CFG.VIEW.lon, b0 = CFG.VIEW.lat;
  const dl = ((tl - l0) % 360 + 540) % 360 - 180;        // 走近路
  const db = Math.max(-89, Math.min(89, tb)) - b0;
  if (Math.abs(dl) < 0.6 && Math.abs(db) < 0.6){ done(); return; }

  const land = () => {
    CFG.VIEW.lon = l0 + dl; CFG.VIEW.lat = b0 + db;
    spinning = false;
    document.body.classList.remove('spinning');
    build(); done();
  };
  // 隐藏标签页里 rAF 不触发，直接落位，不演
  if (document.hidden){ land(); return; }

  spinPts = [...new Set([...CUL.groups].flatMap(x => [...x._members])
                        .concat(Object.keys(DATA.stars)))];
  spinning = true;
  document.body.classList.add('spinning');
  paintSpin();
  // 转多远就演多久，别让转半圈和转五度花一样的时间
  const ms = Math.min(1100, 380 + Math.hypot(dl, db) * 3.2);
  const t0 = performance.now();
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = now => {
    const t = Math.min(1, (now - t0) / ms), k = ease(t);
    CFG.VIEW.lon = l0 + dl * k;
    CFG.VIEW.lat = b0 + db * k;
    paintSpin(); drawEarth();
    if (t < 1) requestAnimationFrame(step); else land();
  };
  requestAnimationFrame(step);
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
  refreshEdges();
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
  else if (DATA) frameOn(0, 0, R * 4.1 * 1.06, 420);
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

/* 底下那行提示。写的是**当下这一屏能做什么**，所以模式一换它就得跟着换。 */
function hintText(){
  return CFG.text.hint(culture, matchMedia('(hover: none)').matches,
                       CFG.VIEW ? CFG.VIEW.mode === 'sphere' : false);
}

/* 头一回来给三行说明。
   上一版只在头一回出现，看过就永远调不回来了 —— 而这种浮层多半是被
   随手关掉的，关掉才发现没看清。所以现在底下那行提示本身可以点，
   点了就再放一遍。「说明只讲一次」跟「不知道怎么操作」是同一件事。 */
let firstrunBox = null;
function showGuide(){
  if (!CFG.text.firstrun) return;
  if (firstrunBox){ firstrunBox.classList.remove('gone'); firstrunBox.classList.add('on'); return; }
  const fr = document.createElement('div');
  firstrunBox = fr;
  fr.id = 'firstrun';
  fr.innerHTML = CFG.text.firstrun.map((t, i) =>
    `<div class="fl"><b>${i + 1}</b><span>${t}</span></div>`).join('')
    + '<div class="fx">知道了</div>';
  document.body.appendChild(fr);
  const dismiss = () => {
    fr.classList.add('gone'); fr.classList.remove('on');
    try { localStorage.setItem('xingtu-seen', '1'); } catch (_){}
  };
  fr.querySelector('.fx').addEventListener('click', dismiss);
  // 在图上动一下（点或拖）就算看过了，不用非去够那个「知道了」
  svg.addEventListener('pointerdown', dismiss, { once: true });
  requestAnimationFrame(() => fr.classList.add('on'));
  setTimeout(() => fr.classList.add('on'), 60);   // 后台标签页 rAF 不触发，补一手
}

{
  const h = document.getElementById('hint');
  if (h && CFG.text.firstrun){
    h.classList.add('askable');
    h.setAttribute('role', 'button');
    h.setAttribute('tabindex', '0');
    h.title = '再看一遍怎么操作';
    const open = () => showGuide();
    h.addEventListener('click', open);
    h.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
    });
  }
  try { firstVisit = !localStorage.getItem('xingtu-seen'); } catch (_){}
  if (firstVisit) showGuide();
}

/* 头一回来，球自己缓缓转一点点再停下。
   「这个球能转」是这一屏上最有意思、也最没人猜得到的一件事。
   写一句「拖动转球」当然也写了，可**演一下比写一句管用**：
   东西自己动过一次，手就知道能去推它。
   桌面上还有 grab 光标兜着，手机上一点提示都没有 —— 而微信是主入口。

   三条约束，缺一条这个演示就变成骚扰：
     · 只在头一回（跟那三行说明同一个开关）
     · 用户一碰就立刻停，绝不跟手指抢
     · 系统说了「减少动态效果」就不演 */
function nudgeSpin(){
  if (!CFG.VIEW || !CFG.rotatable || !CFG.rotatable() || !CUL || !DATA) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.hidden) return;                     // 后台标签页里 rAF 不触发

  const l0 = CFG.VIEW.lon, DEG = 26, MS = 2400;
  let stopped = false;
  const settle = () => {
    spinning = false;
    document.body.classList.remove('spinning');
    removeEventListener('pointerdown', halt, true);
    build();
  };
  function halt(){ if (stopped) return; stopped = true; settle(); }
  // 捕获阶段：比图上那个 pointerdown 先跑，让拖拽接手时场面已经收干净
  addEventListener('pointerdown', halt, true);

  spinPts = Object.keys(DATA.stars);
  spinning = true;
  document.body.classList.add('spinning');        // 光标顺带变成 grabbing
  const t0 = performance.now();
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const step = now => {
    if (stopped) return;                          // 用户接手了，别抢
    const t = Math.min(1, (now - t0) / MS);
    CFG.VIEW.lon = l0 + DEG * ease(t);
    paintSpin(); drawEarth();
    if (t < 1) requestAnimationFrame(step);
    else { stopped = true; settle(); }
  };
  requestAnimationFrame(step);
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
  document.getElementById('hint').textContent = hintText();
  const seg = document.querySelector('#bar > .seg:not(.viewseg)');
  seg.innerHTML = CFG.cultures.map(([k, label], i) =>
    `<button data-c="${k}"${i === 0 ? ' class="on"' : ''}>${label}</button>`).join('');
  bindSeg();
  buildIndex();
  renderSecs();
  /* 首次建图之前先把天顶摆到当前观测地。
     不做这一步，ZENITH 还停在默认值，地影那一层与天顶记号
     会按一个谁也不在的地方去算 —— 默认开天球之后这就不是小事了。 */
  if (CFG.faceSite && CFG.sites && CFG.VIEW && CFG.VIEW.mode === 'sphere')
    CFG.faceSite(CFG.sites[site].lat, site);
  build();
  if (firstVisit) nudgeSpin();
  openFromHash();
});

/* 从星盘或紫微点「看这一天的天」过来：#daily=YYYY-MM-DD。
   用 hash 不用查询串 —— **hash 不随请求发出去，也不进服务器日志**。
   生辰不出这台设备这一条，跨页跳转这一步也得守住。

   必须等数据到位再叫：makeDaily 要用 DATA 和已经建好的 #cardbox，
   第一版写在模块顶层，两样都还没有，静默失败。 */
function openFromHash(){
  const m = (location.hash || '').match(/^#daily=(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return;
  const y = +m[1], mo = +m[2], d = +m[3];
  const ok = y > 1 && y < 3000 && mo >= 1 && mo <= 12
          && d >= 1 && d <= new Date(y, mo, 0).getDate();
  // 用过就抹掉，免得刷新一次又弹一次
  history.replaceState(null, '', location.pathname + location.search);
  if (ok) makeDaily({ y, m: mo, d });
}
}
