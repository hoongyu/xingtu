/* 星图配置：中国星官 / 西方星座。
 *
 * 这份配置回答引擎问的那几个问题：点在哪、多大、什么时候看不见、
 * 画几道参考圈、悬停显示什么、面板统计什么。引擎不认「星等」也不认
 * 「赤纬」，那些语义全在这里。
 */
import { BY_LAT, label } from './places.js?v=186d15d4';

const R = 380;                     // 图面半径，引擎也用它
const rad = d => d * Math.PI / 180;

/* ── 两种看法：摊平的一张图，或者一只能转的球 ──────────────
   平面那张是苏州石刻的形制，一千年来中国星图都这么画。
   它有个避不开的毛病：r 正比于天极距，所以南天被越拉越大 ——
   南极附近撑成一整圈，猎户座下面那片全是变形的。
   球面那张没有这个问题，因为它压根不是投影，就是从外面看这个球。

   两种都留着，不是骑墙：摊平的能一眼看全整个天区，也是文物本来的样子；
   球面的形状是对的，还能转。切换在右上角。 */
// 默认就开天球：形状是对的那一张该先被看见，摊平的那张按需再切。
/* t: 摊开进度，0 是球、1 是平面，只在过渡的那一秒里非零。
   mlat: 过渡中的临时视线纬度（先转正到 90 再摊开）。 */
export const VIEW = { mode: 'sphere', lon: 0, lat: 32,
                      t: 0, mlat: null, mir: null };

/* 换观测地时把球转到那座城的天顶。
   天顶的赤纬**恰好等于观测地的纬度** —— 这不是近似，是定义：
   天顶是铅垂线向上交天球的点，而铅垂线的方向就是当地纬度。
   所以「把这座城摆到球中间」在天球上有一个精确的意思：
   VIEW.lat = 该地纬度。摆好之后，你正对着的那半个球，
   就是此刻在那座城头顶上的那半个天。

   赤经方向不跟着动：那要看时刻，而这是一张星图不是一台天象仪，
   没有「现在几点」。所以左右转由你自己拖。 */
/* 天顶是**天球上的一个点**，不是屏幕中央的一个记号。
   第一版把它画死在原点，于是转了球它还赖在正中间 —— 那当然不对：
   一转开，你正对着的就不再是那座城头顶那块天了，
   天顶应该跟着别的星一起挪到边上去，转到背面就该看不见。

   所以这里记的是它在天上的坐标：赤纬 = 当地纬度（这是定义），
   赤经取「摆正的那一刻」的视线赤经。之后你怎么拖，这个点都不动 ——
   动的是你的视线。 */
export const ZENITH = { ra: 0, dec: 32, site: 0 };

export function faceSite(lat, idx){
  VIEW.lat = Math.max(-89, Math.min(89, lat));
  ZENITH.dec = VIEW.lat;
  ZENITH.ra = VIEW.lon;              // 摆正的这一刻，视线赤经就是天顶赤经
  if (idx != null) ZENITH.site = idx;
}

/** 北极方位等距投影 —— 苏州石刻的形制。
 *  r 正比于天极距，赤经决定方位角。上北、右西（赤经自右向左递增）。*/
function flat(ra, dec){
  const r = (90 - dec) / 180 * R * 2;
  const a = rad(ra) - Math.PI / 2;
  return [Math.cos(a) * r, Math.sin(a) * r];       // 不取反 => 西在右
}

/** 赤道坐标转单位向量。整个球面模式就架在这三行上。 */
function vec(ra, dec){
  const t = rad(ra), p = rad(dec);
  return [Math.cos(p) * Math.cos(t), Math.cos(p) * Math.sin(t), Math.sin(p)];
}

/** 把向量转到「视线坐标」：先绕极轴转到中心赤经，再俯仰到中心赤纬。
 *  返回 [右, 上, 朝我] —— 第三个分量大于零就是朝着观者这一面。 */
function toView3(v, lonDeg, latDeg){
  const l = rad(lonDeg), b = rad(latDeg);
  const cl = Math.cos(l), sl = Math.sin(l);
  const x1 = v[0] * cl + v[1] * sl;
  const y1 = -v[0] * sl + v[1] * cl;
  const z1 = v[2];
  const cb = Math.cos(b), sb = Math.sin(b);
  return [y1, -x1 * sb + z1 * cb, x1 * cb + z1 * sb];
}
function orthoAt(ra, dec, latDeg){
  const w = toView3(vec(ra, dec), VIEW.lon, latDeg);
  return [-w[0] * SR, -w[1] * SR];
}

function toView(v){
  const l = rad(VIEW.lon), b = rad(VIEW.lat);
  const cl = Math.cos(l), sl = Math.sin(l);
  // 绕 z 轴 −lon
  const x1 = v[0] * cl + v[1] * sl;
  const y1 = -v[0] * sl + v[1] * cl;
  const z1 = v[2];
  // 绕 y 轴：把 (lat) 抬到视线中心
  const cb = Math.cos(b), sb = Math.sin(b);
  return [y1, -x1 * sb + z1 * cb, x1 * cb + z1 * sb];
}

const SR = R * 1.86;               // 球的画面半径。跟平面图占的地方差不多
export function depth(ra, dec){ return toView(vec(ra, dec))[2]; }

/** 正交投影：直接取视线坐标的前两个分量。远近由第三个分量决定，
 *  但正交投影不做透视缩放 —— 那正是「从很远的地方看这个球」的样子，
 *  也是天球该有的样子：星星本来就无穷远。 */
/* 球与平面的左右是**反的**，这不是笔误，是两样东西。

   摊平那张是「站在地上抬头看」：苏州石刻的形制，西在右 ——
   仰面朝天时东西本来就跟低头看地图相反。
   球那张是「从外面看一只天球仪」：浑天仪、地球仪都是这么摆的，
   东在右，跟平常看地图一个方向。

   第一版把球也按平面那套取反了，于是投上去的中国是镜像的 ——
   反馈说「看起来不像日常看的地图」，说得对。改回球该有的方向。 */
function ortho(ra, dec){
  const w = toView(vec(ra, dec));
  return [w[0] * SR, -w[1] * SR];
}

/* ── 摊开与卷起 ──────────────────────────────────
   球与平面之间不是换一张图，是同一批星换一种摆法，所以过渡应当看得见。

   做法分两步，顺序是几何决定的，不是随手编的：

   一、**转正**。把球先转到北天极对着你（mlat: 当前纬度 → 90°）。
       这一步之后，球上每颗星的方位角就等于它在平面图上的方位角 ——
       两张图从这一刻起只差一件事：半径怎么算。

   二、**摊开**。正对北极的正交投影是 r = SR·cos(赤纬)，
       苏州石刻那张等距方位投影是 r = 2R·(90−赤纬)/180。
       同一个方位角，两个半径，中间按 t 线性插值 ——
       所以摊开这一下是**纯粹的径向拉伸**，星星各自沿着自己那条半径
       往外走，不会互相穿过去。这正是「摊平」这件事本身。

   卷起来就是倒过来跑：先收半径，再把球转回观测地的天顶。

   为什么值得这么讲究：随手把两组屏幕坐标插值也能动，但那样南天的星
   会横着划过去 —— 看着像洗牌，不像摊开一张图。 */
/** 角度插值走近路，不绕大圈。 */
function lerpAng(a, b, k){
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * k;
}

/* 摊开分两段，现在第一段多做一件事：**换手**。
   球是从外面看（东在右），平面是抬头看（西在右），左右是反的 ——
   所以中间必须翻一次面。翻这一下放在「转正」那一段里做：
   那一段本来就在转，多一个翻面不突兀；
   到第二段「摊开」开始时手已经换好，摊开仍然是纯粹的径向拉伸，
   星星各走各的半径，不互相穿过去。 */
function morph(ra, dec, t, mlat, mir){
  const angF = rad(ra) - Math.PI / 2;                 // 平面那头的方位
  const w = toView3(vec(ra, dec), VIEW.lon, mlat);
  const angS = Math.atan2(-w[1], w[0]);               // 球那头（已换手）
  const rs = Math.hypot(w[0], w[1]) * SR;
  const rf = (90 - dec) / 180 * R * 2;
  const r = rs * (1 - t) + rf * t;
  const ang = lerpAng(angS, angF, mir == null ? t : mir);
  return [Math.cos(ang) * r, Math.sin(ang) * r];
}

function project(ra, dec){
  if (VIEW.t > 0 || VIEW.mir != null)
    return morph(ra, dec, VIEW.t, VIEW.mlat == null ? VIEW.lat : VIEW.mlat,
                 VIEW.mir);
  if (VIEW.mlat != null && VIEW.mlat !== VIEW.lat) return orthoAt(ra, dec, VIEW.mlat);
  return VIEW.mode === 'sphere' ? ortho(ra, dec) : flat(ra, dec);
}

/** 成员星之间的最大角距（度）。判断星官是不是被投影撕开要用它：
 *  投影后的跨度可以很大，真实的角直径却很小 —— 那就是撕开了。 */
function angDiam(hips, stars){
  const v = hips.map(h => {
    const [ra, dec] = stars[h];
    const p = rad(dec), t = rad(ra);
    return [Math.cos(p) * Math.cos(t), Math.cos(p) * Math.sin(t), Math.sin(p)];
  });
  let worst = 1;
  for (let i = 0; i < v.length; i++)
    for (let j = i + 1; j < v.length; j++){
      const d = v[i][0]*v[j][0] + v[i][1]*v[j][1] + v[i][2]*v[j][2];
      if (d < worst) worst = d;
    }
  return Math.acos(Math.max(-1, Math.min(1, worst))) * 180 / Math.PI;
}

/** 插画还能用吗？
 *  北极方位等距投影把南天极摊成整个外圈，靠近南极的星座会被摊成一整圈：
 *  投影跨度接近全图，真实角直径却只有十几度。两个条件同时成立才算撕开 ——
 *  只看跨度会把长蛇座这种「本来就长」的也误伤（它真跨了九十多度）。
 *  撕开的星座贴插画会把 512px 的画撑得比整张天图还大，所以不贴。 */
function artUsable(hips, stars){
  const P = hips.map(h => project(...stars[h].slice(0, 2)));
  const xs = P.map(q => q[0]), ys = P.map(q => q[1]);
  const raw = Math.max(Math.max(...xs) - Math.min(...xs),
                       Math.max(...ys) - Math.min(...ys));
  const torn = raw > R * 4.1 * .52 && angDiam(hips, stars) < 40;
  return !torn;
}

const horizonDec = lat => -(90 - lat);            // 低于此赤纬永不升起

export const CFG = {
  R,
  data: 'skydata.json',
  culture: 'cn',
  /* 默认落在北京，不是列表第一档。
     这个下拉按纬度从北往南排，而表里唯一的境外城市柏林在北纬 52.5 度，
     正好排第一 —— 于是从微信点进来的人，看到的第一张天是柏林的。
     排序本身是对的（那一栏的意思就是「纬度」），改的是起点。 */
  tier: Math.max(0, BY_LAT.findIndex(p => p[1] === '北京')),
  cultures: [['cn', '中国星官'], ['iau', '西方星座']],
  /* 档位 = 观测地纬度。跟星盘页共用同一张地点表 ——
     那边取经度定上升，这边取纬度定外规。按纬度从北到南排，
     下拉从上往下走一遍，能看见南天那片星是怎么一点点沉下去的。 */
  tiers: BY_LAT.map(pl => [label(pl), pl[2]]),
  // 天球要用观测地的经纬度：纬度定天顶的赤纬，经度只用来在小地球上标点。
  sites: BY_LAT.map(pl => ({ n: label(pl), city: pl[1],
                             lat: pl[2], lon: pl[3], tz: pl[4] })),
  pointSet: 'byCulture',      // 两套文化本来就用不同的星，取子集是对的

  project,
  /* 尺寸编码亮度是 1634 年之后的星图传统，这条不动。动的是两个下限。
     反馈说「星星太暗，看不清」—— 量下来是真的，不是口味：
       · 直径：1550 颗里 1058 颗（68%）不到 1.44 个屏幕像素，
         131 颗（8%）连一个像素都不到。亚像素的点，再怎么调不透明度都是糊的。
       · 对比度（相对 #0a0d14 底，无障碍对非文字图形的下限是 3:1）：
         五等 3.20:1、六等 2.15:1、六等半 1.76:1 —— 28% 的星不达标。
     新值最暗处 1.16 像素、4.4:1，全员达标。

     **代价要说清楚**：感知亮度（面积×不透明度）的动态范围从 109:1 掉到 22:1。
     这不是没调好，是数学上的天花板 —— 一旦要求最暗的星也满足「≥1 像素、
     ≥3:1」，范围就封顶在二十几倍。换句话说旧版那个 109:1 是**靠让四分之一
     的星隐形换来的**。这是一张用来认星座的图，不是天文摄影模拟，
     可见性优先。尺寸仍然差 8.4 倍面积，「哪颗亮」一眼还是分得出。 */
  radius: f => Math.max(1.0, 2.9 - f[2] * .30),
  dim: f => Math.max(.42, 1 - f[2] * .10),
  phase: hip => [2.6 + (hip % 40) / 9, (hip % 31) / 8],
  visible: (f, lat) => f[1] >= horizonDec(lat),     // f = [ra, dec, mag]
  artUsable,

  rings: (D, lat) => VIEW.mode === 'sphere' ? [] : [
    [(90 - (90 - lat)) / 180 * R * 2, 'gui', '恒显圈'],
    [(90 - 0) / 180 * R * 2, 'gui equator', '赤道'],
    [(90 - horizonDec(lat)) / 180 * R * 2, 'gui horizon', '外规'],
  ],

  /* 球面模式下三规不再是圆 —— 赤道在球上是一个大圆，看过去是椭圆，
     而且有一半在背面。所以改成沿赤纬采样、逐点投影、背面断开的折线。
     采样一度一点：三百六十个点，画出来的边缘看不出是折线。 */
  ringPaths: (D, lat) => {
    if (VIEW.mode !== 'sphere') return [];
    /* 每道圈连同**它自己的落款位置**一起返回。
       上一版只返回路径，引擎给所有圈的名字写死同一个坐标 ——
       赤道、恒显圈、外规、地平圈四个词叠在一个点上，糊成两团黑，
       第三格露出个「圈」字。反馈说「这写的是什么」，就是这个。
       落款取**最长那一段的中点**。试过取「画面上最高的一点」，不行：
       赤道在球上是个下垂的弧，它最高的两点正好在球缘 x=±707 处，
       名字被顶到球外面去了。中点落在弧的正中，哪道圈都说得通。 */
    const draw = pts => 'M' + pts.map(q => q[0].toFixed(1) + ' '
                                          + q[1].toFixed(1)).join('L');
    const pack = segs => {
      const keep = segs.filter(sg => sg.length > 1);
      if (!keep.length) return ['', null];
      let best = keep[0];
      for (const sg of keep) if (sg.length > best.length) best = sg;
      return [keep.map(draw).join(' '), best[best.length >> 1]];
    };
    const ring = dec => {
      const segs = []; let cur = [];
      for (let ra = 0; ra <= 360; ra += 1){
        if (depth(ra, dec) > 0){ cur.push(project(ra, dec)); }
        else if (cur.length){ segs.push(cur); cur = []; }
      }
      if (cur.length) segs.push(cur);
      return pack(segs);
    };
    const out = [
      [...ring(0), 'gui equator', '赤道'],
      [...ring(90 - lat), 'gui', '恒显圈'],
      [...ring(horizonDec(lat)), 'gui horizon', '外规'],
    ].map(([d, at, cls, lb]) => [d, cls, lb, at]);
    // 观测地的地平圈：天顶九十度之外那一圈，就是那座城的地平线。
    // 它跟外规（永不升起的界）不是一回事：外规是赤纬的界，
    // 地平圈是此刻真正的「看得见到此为止」。
    const horiz = [];
    {
      const zl = rad(VIEW.lon), zb = rad(VIEW.lat);
      // 天顶的单位向量，再取与它成 90 度的一圈
      const zx = Math.cos(zb) * Math.cos(zl), zy = Math.cos(zb) * Math.sin(zl),
            zz = Math.sin(zb);
      // 找两个与天顶正交的基
      let ax = -Math.sin(zl), ay = Math.cos(zl), az = 0;
      const bx = zy * az - zz * ay, by = zz * ax - zx * az, bz = zx * ay - zy * ax;
      let cur = [];
      for (let a = 0; a <= 360; a += 2){
        const t = rad(a), c = Math.cos(t), sn = Math.sin(t);
        const vx = ax * c + bx * sn, vy = ay * c + by * sn, vz = az * c + bz * sn;
        const dec = Math.asin(Math.max(-1, Math.min(1, vz))) * 180 / Math.PI;
        const ra = (Math.atan2(vy, vx) * 180 / Math.PI + 360) % 360;
        if (depth(ra, dec) > 0) cur.push(project(ra, dec));
        else if (cur.length){ horiz.push(cur); cur = []; }
      }
      if (cur.length) horiz.push(cur);
    }
    const [hd, hAt] = pack(horiz);
    if (hd) out.push([hd, 'gui zenring', '地平圈', hAt]);

    // 球的边缘。它不是天上的圈，是「这个球到此为止」，所以单画一道。
    const limb = [];
    for (let a = 0; a <= 360; a += 2)
      limb.push([Math.cos(rad(a)) * R * 1.86, Math.sin(rad(a)) * R * 1.86]);
    out.push([draw(limb) + 'Z', 'gui limb', '', null]);
    return out;
  },

  /* 球面模式下背面的星不画。压暗也试过，读起来像重影 ——
     一颗前面的星和一颗背面的星投到同一个点上，谁也说不清哪个是哪个。
     球就该是不透明的。转过去看背面。 */
  cull: (f) => VIEW.mode === 'sphere' && VIEW.t === 0 && VIEW.mlat == null
               && VIEW.mir == null
               && depth(f[0], f[1]) <= 0.015,
  /* 过渡中背面的星不剔除，改用透明度：摊开到一半时它们从边缘浮出来，
     这一下正是「原来球背面还有这么多」的那个瞬间。 */
  faceAlpha(f){
    if (VIEW.t === 0 && VIEW.mlat == null && VIEW.mir == null) return 1;
    const z = toView3(vec(f[0], f[1]), VIEW.lon,
                      VIEW.mlat == null ? VIEW.lat : VIEW.mlat)[2];
    if (z > 0.015) return 1;
    return Math.max(0, Math.min(1, VIEW.t * 1.6));
  },
  morphing: () => VIEW.t > 0 || VIEW.mlat != null || VIEW.mir != null,
  rotatable: () => VIEW.mode === 'sphere',
  /* 这几样必须挂在 CFG 上，不能只 export ——
     引擎拿到的是 CFG 这个对象，模块的其它导出它看不见。
     第一版只写了 export function faceSite，于是换观测地时
     标签换了、球没转：CFG.faceSite 是 undefined，那个 if 直接跳过。 */
  VIEW, faceSite, ZENITH,

  /* 小地球。天球回答「你头顶上是什么」，它回答「你站在哪」——
     两个问题挨着问才完整，而且换观测地时看得见球在转。

     正交投影，中心就是选中的那座城：所以那座城永远在正中，
     这就是「把这个城市放在地图中间」在球面上的准确做法。
     背面的点与线一律不画，跟天球那边同一套规矩。 */

  /* 把地上的一点投到天上：它正上方的那块天。
     赤纬那头是恒等的 —— 一个地方的天顶赤纬就是它的纬度。
     赤经那头要挑一个时刻：某一刻，赤经 α 正当头的地方，
     其经度是 α 减去格林尼治恒星时。这里把「选中那座城此刻正当头」
     定为基准，于是 ra = ZENITH.ra + (经度 − 该城经度)。

     **必须说明白的一件事**：地球一天转一圈，所以「哪块天压在哪块地上」
     每时每刻都在变。这一层不是天象，是一次对照 ——
     它固定在「选中那座城正当头」的那一瞬。换一座城，整层跟着转。 */
  skyOf(lat, lon, siteIdx){
    const st = this.sites[siteIdx];
    return [((ZENITH.ra + (lon - st.lon)) % 360 + 360) % 360, lat];
  },
  project, depth,

  /* 小地球的中心，跟着天球一起转。
     道理是这样：某一刻，赤经 α 正当头的地方，其地理经度就是 α 减去格林尼治
     恒星时；所以视线赤经每挪 Δ，正下方那个地方的经度也挪 Δ。纬度那一头
     更直接：视线赤纬就是正下方那地的纬度。

     结果是：拖天球的时候，小地球同步在转，你能看见现在正对着的这块天，
     底下压着的是地上哪儿 —— 这正是「转的时候看得见对应的地标」。
     不拖的时候，中心就是选中的那座城，一点不差。 */
  earth(siteIdx){
    const st = this.sites[siteIdx];
    const c = { lat: VIEW.mode === 'sphere' ? VIEW.lat : st.lat,
                lon: VIEW.mode === 'sphere'
                     ? st.lon + (VIEW.lon - ZENITH.ra) : st.lon };
    const toXY = (lat, lon, r) => {
      const b = rad(lat), l = rad(lon - c.lon), b0 = rad(c.lat);
      const cosc = Math.sin(b0) * Math.sin(b) + Math.cos(b0) * Math.cos(b) * Math.cos(l);
      if (cosc <= 0) return null;                       // 转到地球背面去了
      return [Math.cos(b) * Math.sin(l) * r,
              -(Math.cos(b0) * Math.sin(b) - Math.sin(b0) * Math.cos(b) * Math.cos(l)) * r];
    };
    return { center: c, toXY, sites: this.sites,
             site: st, drifted: Math.abs(VIEW.lon - ZENITH.ra) > 0.5
                              || Math.abs(VIEW.lat - ZENITH.dec) > 0.5 };
  },

  tipRows(hip, D, below){
    const [ra, dec, mag] = D.stars[hip];
    const nm = D.names[hip];
    const isMansion = D.lunar_mansions.includes(+hip);
    return (nm ? `<div class="nm">${nm}</div>` : `<div class="nm">HIP ${hip}</div>`)
      + `<div><span class="k">星等</span><span class="v">${mag.toFixed(2)}</span></div>`
      + `<div><span class="k">赤经</span><span class="v">${(ra/15).toFixed(2)}h</span></div>`
      + `<div><span class="k">赤纬</span><span class="v">${dec>=0?'+':''}${dec.toFixed(1)}°</span></div>`
      + (isMansion ? `<div class="warn">二十八宿距星</div>` : '')
      + (below ? `<div class="warn">在此纬度永不升起</div>` : '')
      // 单颗星的天文事实。跟星官的来历分开：那边是人怎么看它，这边是它是什么。
      + (D.notes && D.notes[hip] ? `<div class="note">${D.notes[hip]}</div>` : '');
  },

  facts(g, D, lat, place){
    const n = g._members.size;
    const hd = horizonDec(lat);
    const below = [...g._members].filter(h => D.stars[h][1] < hd).length;
    return `<span>成员 <b>${n}</b> 星</span><span>折线 <b>${g.lines.length}</b> 段</span>`
      + (below ? `<span style="color:var(--zhu)">其中 `
               + `<b style="color:var(--zhu)">${below}</b> 颗在${place}永不升起</span>` : '');
  },

credits:
    '<h4>平面与天球</h4>'
  + '<p>默认是天球。摊平的那一张（「平面」）是苏州石刻的形制，'
  + '一千年来中国星图都这么画，但它有个避不开的毛病：'
  + '半径正比于天极距，南天越往外拉得越大，南极附近撑成一整圈。'
  + '天球那张没有这个问题 —— 它不是投影，就是从外面看这个球，还能拖着转。</p>'

  + '<h4>天球上那层「地影」</h4>'
  + '<p>青灰的细线是各大洲的轮廓，朱线是中国的疆域，朱点是分野的十二州。'
  + '它们不是天上的东西 —— 是把地上的轮廓投到了它正上方的那块天：'
  + '一个地方的天顶赤纬恰好等于它的纬度，赤经那头则要挑一个时刻。</p>'
  + '<p class="fine">所以必须说明白：地球一天转一圈，'
  + '「哪块天压在哪块地上」时时刻刻都在变。这一层不是天象，是一次对照 ——'
  + '它固定在「选中那座城正当头」的那一瞬，换一座城，整层跟着转。'
  + '地形数据取自 Natural Earth（公有领域），'
  + '构建时简化过，只留看得出形状的那些点。</p>'

  + '<h4>星表坐标</h4>'
  + '<p>NADC 中国古天文基础参考星表（CAAFRC），'
  + '<a href="https://doi.org/10.12149/100877" target="_blank" rel="noopener">DOI 10.12149/100877</a>。'
  + '授权 CC BY 4.0。1550 颗星的赤经赤纬与星等全部来自它。</p>'

  + '<h4>星官与星座连线</h4>'
  + '<p>Stellarium sky cultures，授权 CC BY-SA 4.0。'
  + '<a href="https://github.com/Stellarium/stellarium" target="_blank" rel="noopener">github.com/Stellarium/stellarium</a></p>'

  + '<h4>星座插画 85 张</h4>'
  + '<p>绘者 <b>Johan Meuris</b>，授权 '
  + '<a href="https://artlibre.org/licence/lal/en/" target="_blank" rel="noopener">Free Art License 1.3</a>。'
  + '原件出处：<a href="https://github.com/Stellarium/stellarium-skycultures" target="_blank" rel="noopener">'
  + 'Stellarium sky cultures 仓库</a>，本项目取用的提交号记在 data/source/ART_COMMIT.txt。'
  + '插画以独立文件发布（web/art/ 下的 .webp），未经内联或打包 —— '
  + '这是 Free Art License 第 4 条的要求。</p>'

  + '<h4>来历文字 396 条</h4>'
  + '<p>本项目撰写。只写考据过的；查不准的宁可留白。</p>'

  + '<p class="fine">本页所用数据（skydata.json）含 Stellarium 的星官连线，'
  + '按 CC BY-SA 4.0 发布。插画的授权独立于此，见上。'
  + '渲染引擎与讲解文字为本项目原创。</p>'
  + '<p class="fine">投影为北极方位等距，苏州石刻天文图的形制。'
  + '「永不升起」按所选观测地的纬度实算，不是估的。</p>',

  text: {
    siteLabel: '观 测 地',
    title: '星 图',
    placeholder: '搜星官、星座、星名…',
    /* 底下那行提示得写**当下这一屏真正能做的动作**，按使用顺序排。
       原来写「点 一 颗 星 官」，漏掉了两件更重要的：
       扫过就亮（点是用来放大的），以及天球可以拖着转。
       「能拖」在桌面上还有 grab 光标兜着，**手机上一点提示都没有** ——
       而微信是这个站的主入口。所以触摸那一路要把「拖」写在最前面。 */
    hint: (c, touch, sphere) => [
      sphere ? (touch ? '手 指 拖 动 转 球' : '拖 动 转 球') : '',
      touch ? (c === 'cn' ? '点 一 颗 星 官' : '点 一 个 星 座') : '扫 过 就 亮',
      touch ? '' : '点 开 放 大',
    ].filter(Boolean).join('　·　'),   // 分隔符只用一种，三段是平级的
    tag: c => c === 'cn' ? '星官' : '星座',
    lost: n => `${n} 颗永不升起`,
    noLore: '讲解待撰。此处只放考据过的文字，不写没把握的来历。',
    back: '← 退 回 全 天',
    // 点进星官之后能做什么。原来这些一条都没告诉过人。
    /* 缩进之后面板里那一行。退出的三条路都写上 ——
       双击排第一，它是手上最省事的那条；按钮和 Esc 跟在后面，
       手势得有看得见的同义词。 */
    guide: '双击任意处退回全天　·　左上角那枚「退 回 全 天」或 Esc 也行　·　'
         + '点旁边任何一颗暗星 → 直接跳到那颗星所在的星官　·　点星官名看来历',
    /* 头一回来看到的三行。上一版写的是：
         「亮着轮廓的是有讲解的星官，点它进去」
         「进去之后点旁边的暗星，会直接换到那颗星所在的星官」
         「左边名单与检索栏可以直接跳」
       三条都不算错，但**排序和取舍都不对**：
       第一条在改成「扫过就亮」之后已经过时；第二条是个次要技巧，
       却排在主要动作前面；而整张屏上最大、最好玩、也最没人猜得到的
       那件事 —— **这个球可以拖着转** —— 一个字都没提。
       反馈说「点进去不知道怎么操作」，说的就是这个。
       重写：按真正会用到的顺序，一行一个动作，动词打头。 */
    firstrun: ['<b>拖动</b>球面，转到哪儿看哪儿 —— 背面也有半个天',
               '<b>鼠标停在</b>星官上就亮起来（手机上点一下），<b>再点</b>放大细看',
               '放大之后<b>双击</b>就退回全天（左上角那枚「退 回 全 天」也行）',
               '<b>左边名单</b>直接跳，<b>右下角</b>出一张今晚的图'],
    noBrief: '尚无讲解。',
  },

  rail: [
    ['黄 道 十 三 宫',
     ['白羊座','金牛座','双子座','巨蟹座','狮子座','室女座','天秤座',
      '天蝎座','蛇夫座','人马座','摩羯座','宝瓶座','双鱼座']],
    ['二 十 八 宿',
     ['角宿','亢宿','氐宿','房宿','心宿','尾宿','箕宿',
      '斗宿','牛宿','女宿','虚宿','危宿','室宿','壁宿',
      '奎宿','娄宿','胃宿','昴宿','毕宿','觜宿','参宿',
      '井宿','鬼宿','柳宿','星宿','张宿','翼宿','轸宿']],
    ['名 星 官',
     ['北斗','紫微右垣','紫微左垣','太微右垣','天市右垣','织女','河鼓',
      '天津','老人','天狼','轩辕','螣蛇','羽林军','天船','贯索',
      '五帝座','天大将军','大角','北极','华盖']],
  ],
};
