/* 星图配置：中国星官 / 西方星座。
 *
 * 这份配置回答引擎问的那几个问题：点在哪、多大、什么时候看不见、
 * 画几道参考圈、悬停显示什么、面板统计什么。引擎不认「星等」也不认
 * 「赤纬」，那些语义全在这里。
 */
import { BY_LAT, label } from './places.js?v=3deca637';

const R = 380;                     // 图面半径，引擎也用它
const rad = d => d * Math.PI / 180;

/* ── 两种看法：摊平的一张图，或者一只能转的球 ──────────────
   平面那张是苏州石刻的形制，一千年来中国星图都这么画。
   它有个避不开的毛病：r 正比于天极距，所以南天被越拉越大 ——
   南极附近撑成一整圈，猎户座下面那片全是变形的。
   球面那张没有这个问题，因为它压根不是投影，就是从外面看这个球。

   两种都留着，不是骑墙：摊平的能一眼看全整个天区，也是文物本来的样子；
   球面的形状是对的，还能转。切换在右上角。 */
export const VIEW = { mode: 'flat', lon: 0, lat: 32 };

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
function ortho(ra, dec){
  const w = toView(vec(ra, dec));
  return [-w[0] * SR, -w[1] * SR];   // 取反保持右西上北，跟平面图一致
}

function project(ra, dec){
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
  tier: 0,
  cultures: [['cn', '中国星官'], ['iau', '西方星座']],
  /* 档位 = 观测地纬度。跟星盘页共用同一张地点表 ——
     那边取经度定上升，这边取纬度定外规。按纬度从北到南排，
     下拉从上往下走一遍，能看见南天那片星是怎么一点点沉下去的。 */
  tiers: BY_LAT.map(pl => [label(pl), pl[2]]),
  pointSet: 'byCulture',      // 两套文化本来就用不同的星，取子集是对的

  project,
  radius: f => Math.max(.45, 2.6 - f[2] * .3),      // 1634 年后的传统：尺寸编码亮度
  dim: f => Math.max(.22, 1 - f[2] * .12),
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
    const ring = dec => {
      const segs = []; let cur = [];
      for (let ra = 0; ra <= 360; ra += 1){
        if (depth(ra, dec) > 0){ cur.push(project(ra, dec)); }
        else if (cur.length){ segs.push(cur); cur = []; }
      }
      if (cur.length) segs.push(cur);
      return segs.filter(sg => sg.length > 1)
        .map(sg => 'M' + sg.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L'))
        .join(' ');
    };
    const out = [
      [ring(0), 'gui equator', '赤道'],
      [ring(90 - lat), 'gui', '恒显圈'],
      [ring(horizonDec(lat)), 'gui horizon', '外规'],
    ];
    // 球的边缘。它不是天上的圈，是「这个球到此为止」，所以单画一道。
    const limb = [];
    for (let a = 0; a <= 360; a += 2)
      limb.push([Math.cos(rad(a)) * R * 1.86, Math.sin(rad(a)) * R * 1.86]);
    out.push(['M' + limb.map(q => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z',
              'gui limb', '']);
    return out;
  },

  /* 球面模式下背面的星不画。压暗也试过，读起来像重影 ——
     一颗前面的星和一颗背面的星投到同一个点上，谁也说不清哪个是哪个。
     球就该是不透明的。转过去看背面。 */
  cull: (f) => VIEW.mode === 'sphere' && depth(f[0], f[1]) <= 0.015,
  rotatable: () => VIEW.mode === 'sphere',
  VIEW,

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
    '<h4>星表坐标</h4>'
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
    hint: c => c === 'cn' ? '点 一 颗 星 官' : '点 一 个 星 座',
    tag: c => c === 'cn' ? '星官' : '星座',
    lost: n => `${n} 颗永不升起`,
    noLore: '讲解待撰。此处只放考据过的文字，不写没把握的来历。',
    back: '← 退 回 全 天',
    // 点进星官之后能做什么。原来这些一条都没告诉过人。
    guide: '点旁边任何一颗暗星 → 直接跳到那颗星所在的星官　·　'
         + '点星官名看来历　·　左上角退回全天，或按 Esc',
    firstrun: ['亮着轮廓的是有讲解的星官，点它进去',
               '进去之后点旁边的暗星，会直接换到那颗星所在的星官',
               '左边名单与检索栏可以直接跳，不用在天上找'],
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
