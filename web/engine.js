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
  setVB(`${-R*2.05} ${-R*2.05} ${R*4.1} ${R*4.1}`);
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
  for (const [d, cls, label] of (CFG.ringPaths ? CFG.ringPaths(DATA, tierV) : [])){
    if (!d) continue;
    const q = document.createElementNS(NS,'path');
    q.setAttribute('d', d); q.setAttribute('class', cls);
    gGui.appendChild(q);
    if (label){
      const t = document.createElementNS(NS,'text');
      t.setAttribute('class','gui-label');
      t.setAttribute('x', 6); t.setAttribute('y', -R * 1.9);
      t.textContent = label; gGui.appendChild(t);
    }
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
  /* 只在「中国星官」这一套下画。分野是中国星占自己的东西 ——
     摆在西方星座那一套上头，是把两套不相干的系统叠在一起。
     平面与天球两张都画：分野讲的是天地对应，跟用哪种摆法无关。 */
  if (GEO && CFG.skyOf && CFG.VIEW && culture === 'cn'){
    const pr = (la, lo) => {
      const [ra, dec] = CFG.skyOf(la, lo, site);
      return CFG.depth(ra, dec) > 0.015 ? CFG.project(ra, dec) : null;
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
    /* 十二州挤在中原那一小片，投到图上常常只占几十个像素 ——
       名字全写出来会叠成一坨（第一版就是，截图里糊成一团）。
       点全留，名字按距离取舍：离已放的名字太近就只留点。
       间距按当前缩放折算成屏幕像素，不然缩放一变就又挤上了。 */
    const sfs = parseFloat(svg.style.getPropertyValue('--sfs')) || 2.2;
    const MINGAP = 26 * sfs;
    const placedLbl = [];
    for (const z of (CFG.zhou || [])){
      const q = pr(z.lat, z.lon);
      if (!q) continue;
      const c = document.createElementNS(NS,'circle');
      c.setAttribute('cx', q[0].toFixed(1)); c.setAttribute('cy', q[1].toFixed(1));
      c.setAttribute('r', 3.5); c.setAttribute('class','skzhou');
      gEarthSky.appendChild(c);
      if (placedLbl.some(p2 => Math.hypot(p2[0]-q[0], p2[1]-q[1]) < MINGAP)) continue;
      placedLbl.push(q);
      const t = document.createElementNS(NS,'text');
      t.setAttribute('x', q[0].toFixed(1)); t.setAttribute('y', (q[1] - 8).toFixed(1));
      // 加个「古」字。这些是汉代的州，不是今天的地名。
      t.setAttribute('class','skzname'); t.textContent = '古' + z.n;
      gEarthSky.appendChild(t);
    }
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
  if (CFG.VIEW && CFG.sites && CFG.ZENITH && culture === 'cn'){
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

  /* 十二州。转球的时候要能看见地标 —— 光有点没有名字，
     转过去也不知道转到哪儿了。这十二个是分野配到地上的那十二州，
     跟星盘页那张分野图是同一份数据（places.js 里的 ZHOU）。 */
  if (E.zhou && culture === 'cn') for (const z of E.zhou){
    const q = E.toXY(z.lat, z.lon, ER);
    if (!q) continue;
    host.appendChild(mk('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: 1.8 },
                        'ezhou'));
    const t = mk('text', { x: q[0].toFixed(1), y: (q[1] - 4).toFixed(1) }, 'ezname');
    t.textContent = '古' + z.n;
    host.appendChild(t);
  }

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
  if (GEO && CFG.skyOf && culture === 'cn'){
    const pr = (la, lo) => {
      const [ra, dec] = CFG.skyOf(la, lo, site);
      return CFG.depth(ra, dec) > 0.015 ? CFG.project(ra, dec) : null;
    };
    const stroke = (rings, color, w) => {
      ctx.strokeStyle = color; ctx.lineWidth = w;
      ctx.beginPath();
      for (const sg of projectRings(rings, pr))
        sg.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
      ctx.stroke();
    };
    stroke(GEO.land, 'rgba(126,166,182,.34)', 1);
    stroke(GEO.china, 'rgba(212,97,79,.62)', 1.5);
    ctx.fillStyle = 'rgba(212,97,79,.9)';
    for (const z of (culture === 'cn' ? (CFG.zhou || []) : [])){
      const q = pr(z.lat, z.lon);
      if (!q) continue;
      ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = '#e8e2d4';
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
    if (!CFG.rotatable() || sel) return;      // 缩进某个星官时不转
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
    // 一个球宽拖满 = 转 180 度。这个手感跟大多数地球仪一致
    const f = 180 / Math.max(240, Math.min(r.width, r.height));
    CFG.VIEW.lon = drag.lon + (e.clientX - drag.x) * f;
    CFG.VIEW.lat = Math.max(-89, Math.min(89, drag.lat + (e.clientY - drag.y) * f));
    /* 按时间节流，不用 requestAnimationFrame。
       现代浏览器的 pointermove 本来就跟刷新率对齐（还会合并），
       再套一层 rAF 没有额外好处；而这个项目已经被「rAF 在隐藏标签页
       不触发」坑过三回，交互路径上能不依赖它就不依赖。
       12 ms 一次，约合八十帧，足够跟手。
       小地球跟着一起重画 —— 这正是「转的时候看得见对应的地标」。
       它两百来个元素，这个频率下不贵。 */
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
async function makeDaily(){
  const host = document.getElementById('cardhost');
  const box = document.getElementById('cardbox');
  box.classList.add('on');
  host.innerHTML = '<div id="cardwait">正 在 排 今 晚 …</div>';
  const [EPH, LUN, CARD] = await Promise.all([
    import('./ephem.js?v=e6ac781a'),
    import('./lunar.js?v=699142ab'),
    import('./card.js?v=00000000'),
  ]);
  await CARD.ready();

  const st = CFG.sites[site];
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth() + 1, d = now.getDate();
  const c = EPH.compute(y, mo, d, 21, 8, st.lat, st.lon);   // 当地二十一点
  const L = LUN.toLunar(Date.UTC(y, mo - 1, d, 21 - 8, 0));

  /* 今晚哪个星官最高。取有讲解的那些，算成员星的平均高度，
     选最高的一个 —— 「抬头就看得见」说的就是它。 */
  const rad = x => x * Math.PI / 180;
  const meanAlt = g => {
    const hs = [...new Set(g.lines.flat())];
    let s2 = 0, n = 0;
    for (const h of hs){
      const f = DATA.stars[h]; if (!f) continue;
      const H = rad(c.ramc - f[0]), dd = rad(f[1]), phi = rad(st.lat);
      s2 += Math.asin(Math.max(-1, Math.min(1,
        Math.sin(dd) * Math.sin(phi) + Math.cos(dd) * Math.cos(phi) * Math.cos(H))))
        * 180 / Math.PI;
      n++;
    }
    return n ? s2 / n : -99;
  };
  const withLore = DATA.cultures.cn.groups.filter(g => DATA.lore && DATA.lore[g.name]);
  const top = withLore.map(g => ({ g, a: meanAlt(g) }))
                      .sort((x, z) => z.a - x.a)[0];
  const lore = top ? String(DATA.lore[top.g.name]).replace(/<[^>]+>/g, '') : '';

  const SEVEN = ['月亮', '金星', '火星', '木星', '土星'];
  const upNow = SEVEN.filter(n => {
    const b = c.bodies[n];
    const H = rad(c.ramc - b.ra), dd = rad(b.dec), phi = rad(st.lat);
    return Math.sin(dd) * Math.sin(phi) + Math.cos(dd) * Math.cos(phi) * Math.cos(H) > 0;
  });

  const spec = {
    square: true,
    title: '抬 头 日 签',
    side: '今 晚 二 十 一 时',
    big: `${CARD.cnDigits(y)}年${CARD.cnSmall(mo)}月${CARD.cnSmall(d)}日`,
    sub: [
      L ? `农历 ${L.leap ? '闰' : ''}${CARD.CN_M[L.month]}月${CARD.CN_D[L.day]}` : '',
      `${st.n}　${st.lat >= 0 ? '北纬' : '南纬'}${Math.abs(st.lat).toFixed(2)}°`,
    ].filter(Boolean),
    quote: top
      ? `今晚抬头，${top.g.name}正在你头顶 ${top.a.toFixed(0)} 度高处。`
        + (lore ? lore.slice(0, 46) : '')
      : '',
    fine: [
      upNow.length ? `此刻在地平线以上：${upNow.join('、')}`
                   : '此刻五星与月都在地平线以下',
      `当地恒星时 ${(c.ramc / 15).toFixed(2)}h　儒略日 ${c.jd.toFixed(4)}`,
    ],
    stance: '位置是算的，说法是传统的',
    sky: { lst: c.ramc, lat: st.lat, stars: DATA.stars,
           groups: DATA.cultures.cn.groups.slice(0, 120).map(g => g.lines),
           bodies: SEVEN.map(n => [n, c.bodies[n]]) },
  };

  const cv = document.createElement('canvas');
  CARD.draw(cv, spec, 2);
  CARD.present(cv,
    `日签_${y}${String(mo).padStart(2,'0')}${String(d).padStart(2,'0')}.png`, host);
}

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
  if (g._label) g._label.classList.add('lit');
  ensureFig(g)?.classList.add('on');
  showCard(g, e);
}
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
    if (g._label) g._label.classList.add('show');
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
  if (g._label) g._label.classList.remove('show');
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
  build();
});

bindSpin();
bindView();

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
});
}
