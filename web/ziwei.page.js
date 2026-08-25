/* 紫微斗数页的界面。排盘逻辑在 ziwei.js，词条在 ziwei.text.js，
   这里只管画与动。

   盘面用传统的四乘四方图：十二宫沿四边按地支排，中间二乘二是中宫。
   跟星图星盘那三页的圆盘刻意做成两回事 —— 圆盘与方盘本来就是
   两套天下观，一个把天看成绕极旋转的球面，一个把它折成能摊在案上的方图。

   动效用 GSAP（3.15，自 2025 年起全部免费）。用它不是为了炫：
   十二宫要按地支顺序一格一格落下来，每格里的星再依次显影 ——
   这种「先有格、后有星」的次序本身就是排盘的次序，手写 setTimeout
   能做但会很难读，交给时间轴干净得多。 */
import { gsap } from './gsap.esm.js?v=7cc4cd8f';
import * as BIRTH from './birth.js?v=af8e9281';
import { cast, ZHI, GAN } from './ziwei.js?v=f9ac3cd5';
import { PALACE_WHY, STAR_WHY, AUX_WHY, HUA_WHY, JU_WHY, STANCE,
         STAR_MIRROR, EMPTY_MIRROR, PALACE_SHORT } from './ziwei.text.js?v=8cb9b134';

const $ = id => document.getElementById(id);
const CN_D = ['', '初一','初二','初三','初四','初五','初六','初七','初八','初九','初十',
  '十一','十二','十三','十四','十五','十六','十七','十八','十九','二十',
  '廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
const CN_M = ['', '正','二','三','四','五','六','七','八','九','十','冬','腊'];

/* 方图上十二宫的落位。数组下标是格子序（0–15，四乘四），
   值是该格要放的地支。中间四格留给中宫。
   这是传统排法：巳午未申 / 辰□□酉 / 卯□□戌 / 寅丑子亥。 */
const CELL = [5, 6, 7, 8, 4, null, null, 9, 3, null, null, 10, 2, 1, 0, 11];

let chart = null;
/* 生辰跟星盘那页共用一份，存在本机。在两页之间来回切、
   或者点一圈再回来，填过的都还在。见 birth.js。 */
const SAVED = BIRTH.load();
let pick = SAVED ? { y: SAVED.y, m: SAVED.m, d: SAVED.d } : { y: 2000, m: 1, d: 1 };
let calY = pick.y, calM = pick.m;

/* ── 小历 ───────────────────────────────────────── */
function calendar(){
  const box = $('zcal');
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'zcalhead';
  const mk = (t, fn, cls) => {
    const b = document.createElement('span');
    b.className = cls || 'zcalnav'; b.textContent = t;
    if (fn) b.addEventListener('click', fn);
    return b;
  };
  head.append(
    mk('«', () => { calY--; calendar(); }),
    mk('‹', () => { calM--; if (calM < 1){ calM = 12; calY--; } calendar(); }),
    mk(`${calY} 年 ${calM} 月`, null, 'zcaltitle'),
    mk('›', () => { calM++; if (calM > 12){ calM = 1; calY++; } calendar(); }),
    mk('»', () => { calY++; calendar(); }));
  box.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'zcalgrid';
  for (const w of ['日','一','二','三','四','五','六']){
    const c = document.createElement('span');
    c.className = 'zcalwk'; c.textContent = w; grid.appendChild(c);
  }
  const first = new Date(Date.UTC(calY, calM - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(calY, calM, 0)).getUTCDate();
  for (let i = 0; i < first; i++) grid.appendChild(document.createElement('span'));
  for (let d = 1; d <= days; d++){
    const c = document.createElement('span');
    c.className = 'zcalday'; c.textContent = d;
    if (calY === pick.y && calM === pick.m && d === pick.d) c.classList.add('on');
    c.addEventListener('click', () => { pick = { y: calY, m: calM, d }; calendar(); });
    grid.appendChild(c);
  }
  box.appendChild(grid);
  $('zdstamp').textContent = `${pick.y} 年 ${pick.m} 月 ${pick.d} 日`;
  // 同星盘：带着这里选的日子去星图看那一晚的天。hash 不进服务器日志。
  const dl = $('dailylink');
  if (dl) dl.href = `index.html#daily=${pick.y}-`
    + `${String(pick.m).padStart(2,'0')}-${String(pick.d).padStart(2,'0')}`;
  BIRTH.forgetBtn($('zdstamp'));
}

/* ── 起盘与画盘 ─────────────────────────────────── */
function run(){
  const hh = +$('zh').value, mi = +$('zmin').value;
  const male = document.querySelector('input[name=zsex]:checked').value === 'm';
  const c = cast(pick.y, pick.m, pick.d, hh, mi, male);
  if (!c){ $('zlunar').textContent = '此日期超出可算范围。'; return; }
  // 记在本机。只写这一页懂的那几项，星盘填的出生地不动。
  BIRTH.save({ y: pick.y, m: pick.m, d: pick.d, hh, mi, male });
  BIRTH.forgetBtn($('zdstamp'));
  chart = c;

  $('zstamp').textContent =
    `${c.greg.y}-${String(c.greg.mo).padStart(2,'0')}-${String(c.greg.d).padStart(2,'0')} `
    + `${String(hh).padStart(2,'0')}:${String(mi).padStart(2,'0')} · ${male ? '乾造' : '坤造'}`;
  $('zlunar').innerHTML =
    `农历 <b>${c.lunar.year}</b> 年 <b>${c.lunar.leap ? '闰' : ''}${CN_M[c.lunar.month]}</b> 月 `
    + `<b>${CN_D[c.lunar.day]}</b><br>`
    + `<b>${ZHI[c.shi]}</b> 时　年干支 <b>${c.ganzhi}</b>（${c.shengxiao}）<br>`
    + `五行局 <b>${c.juName}</b>`;

  draw();
  syncAsk($('zaskq') && $('zaskq').value || '命宫');
  read(chart.palaces.find(x => x.name === (($('zaskq') && $('zaskq').value) || '命宫')));
}

function draw(){
  const g = $('zgrid');
  g.innerHTML = '';
  const cells = [];
  CELL.forEach((zhi, i) => {
    if (zhi === null){
      if (i === 5){                                  // 中宫只建一次
        const mid = document.createElement('div');
        mid.id = 'zcenter';
        const c = chart;
        mid.innerHTML =
          `<div class="zc1">${c.male ? '乾' : '坤'} 造</div>`
          + `<div class="zc2">`
          + `农历 ${c.lunar.year} 年 ${c.lunar.leap ? '闰' : ''}${CN_M[c.lunar.month]}月`
          + `${CN_D[c.lunar.day]} ${ZHI[c.shi]}时<br>`
          + `年干支 <b>${c.ganzhi}</b>　生肖 <b>${c.shengxiao}</b><br>`
          + `五行局 <b>${c.juName}</b>　命宫在 <b>${ZHI[c.ming]}</b><br>`
          + `身宫在 <b>${ZHI[c.shen]}</b>　大限 <b>${c.forward ? '顺行' : '逆行'}</b>`
          + `</div>`
          + `<div class="zseal">紫微在 ${ZHI[c.zwPos]}</div>`
          /* 香炉在中宫底下，摆在文字后面，不挡读。
             形制取博山炉 —— 汉代那一路：底下一只承盘，短柄，
             豆形的炉身，盖子做成层叠的山，山缝就是出烟的孔。
             第一版画的是个泛泛的三足鼎，反馈说丑，确实丑：
             它不像任何一件真东西。博山炉的轮廓是认得出来的，
             而且「山」这个意思跟这一页也对得上。 */
          + `<svg id="zcenser" viewBox="0 0 132 104" aria-hidden="true">`
          + smokeSVG()
          // 承盘
          + `<path d="M24 96 Q66 104 108 96 Q66 90 24 96Z" class="zpan"/>`
          // 短柄
          + `<path d="M58 90V80 M74 90V80"/>`
          // 豆形炉身与口沿
          + `<path class="zbowl" d="M30 58 Q30 82 66 82 Q102 82 102 58Z"/>`
          + `<path d="M24 58H108"/>`
          // 山形盖：三层，层与层错开，缝即出烟处
          + `<path d="M32 58 L41 46 L50 54 L58 42 L66 51 L74 42 L82 54 L91 46 L100 58"/>`
          + `<path d="M43 48 L51 37 L59 45 L66 34 L73 45 L81 37 L89 48"/>`
          + `<path d="M54 39 L60 27 L66 18 L72 27 L78 39"/>`
          + `<circle cx="66" cy="15" r="3.2"/>`
          + `</svg>`;
        g.appendChild(mid);
      }
      return;
    }
    const p = chart.palaces.find(x => x.zhi === zhi);
    const el = document.createElement('div');
    el.className = 'zp' + (p.name === '命宫' ? ' ming' : '')
                 + (p.isShen ? ' shen' : '') + (p.stars.length ? '' : ' empty');
    el.dataset.pal = p.name;         // 「我想问」靠它把那一格标出来
    el.style.gridArea = `${Math.floor(i / 4) + 1} / ${i % 4 + 1}`;
    const cls = k => k === '主' ? 'zh' : k === '吉' ? 'zj' : 'zs';
    el.innerHTML =
      `<div class="zpz">${GAN[p.gan]}${ZHI[p.zhi]}</div>`
      + `<div class="zpn">${p.name}</div>`
      + `<div class="zps">` + p.stars.map(s =>
          `<span class="zst ${cls(s.kind)}">${s.name}`
          + (s.hua ? `<span class="zhua">${s.hua}</span>` : '') + `</span>`).join('')
      + `</div><div class="zdx">${p.daxian[0]}–${p.daxian[1]}</div>`;
    el.addEventListener('click', () => { syncAsk(p.name); read(p); });
    g.appendChild(el);
    cells.push(el);
  });

  /* 十二宫按地支顺序一格一格落下，每格里的星再依次显影。
     这个次序就是排盘的次序：先有宫，后有星。 */
  gsap.killTweensOf('#zgrid .zp, #zgrid .zst, #zcenter');
  gsap.fromTo(cells,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: .42, ease: 'power2.out', stagger: .035 });
  gsap.fromTo('#zgrid .zst',
    { opacity: 0 },
    { opacity: 1, duration: .3, ease: 'none', stagger: .012, delay: .3 });
  gsap.fromTo('#zcenter',
    { opacity: 0, scale: .97 },
    { opacity: 1, scale: 1, duration: .6, ease: 'power2.out', delay: .5 });
}

/* ── 竹枝：按《芥子园画传》的画法算出来，不照印象画 ────────
   画传里竹叶不是一片一片描的，是一笔撇出来的：起笔按下去、
   收笔提起来出尖，所以叶子起端钝、末端尖，长宽比十比一上下。
   成组也有定规 —— 三叶为「个」字，四叶为「介」字，
   同一组的叶子从一点分出，角度散开而不交叉。

   第一版我是目测着写贝塞尔控制点的，出来是几片胖梭子。
   现在叶形由长度与角度算：中轴上取三个点，一侧鼓出去、另一侧
   几乎贴着中轴回来，两条曲线在尖端严格重合 —— 出尖靠的是这个重合。 */
function leafPath(x, y, ang, len, w){
  const r = ang * Math.PI / 180;
  const ux = Math.cos(r), uy = Math.sin(r);     // 中轴方向
  const nx = -uy, ny = ux;                      // 法线
  const tipX = x + ux * len, tipY = y + uy * len;
  // 鼓的一侧：在三分之一处最宽，之后迅速收到尖端
  const c1x = x + ux * len * .30 + nx * w,      c1y = y + uy * len * .30 + ny * w;
  const c2x = x + ux * len * .72 + nx * w * .72, c2y = y + uy * len * .72 + ny * w * .72;
  // 回来的一侧几乎贴着中轴，只留一点点厚度 —— 竹叶不是对称的
  const c3x = x + ux * len * .66 - nx * w * .16, c3y = y + uy * len * .66 - ny * w * .16;
  const c4x = x + ux * len * .26 - nx * w * .22, c4y = y + uy * len * .26 - ny * w * .22;
  const f = n => n.toFixed(1);
  return `M${f(x)} ${f(y)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(tipX)} ${f(tipY)}`
       + `C${f(c3x)} ${f(c3y)} ${f(c4x)} ${f(c4y)} ${f(x)} ${f(y)}Z`;
}

/** 一丛竹。竿带节，三组叶：一「介」两「个」。角度是定的，不随机 ——
    随机出来的竹叶会互相穿插，那是画传里明说要避的。 */
function bamboo(g){
  if (!g || g.childElementCount) return;
  const add = (d, cls) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    n.setAttribute('d', d); n.setAttribute('class', cls); g.appendChild(n);
  };
  // 竿：两节微弯，节间画一道短横 —— 竹之所以是竹，一半在节上
  add('M10 0 C30 46 42 104 38 168', 'zstem');
  add('M22 34 C36 62 40 96 39 132', 'zstem2');
  for (const [x, y, w] of [[24, 40, 11], [31, 78, 10], [36, 116, 9], [38, 152, 8]])
    add(`M${x - w / 2} ${y}h${w}`, 'znode');
  // 介字：四叶。个字：三叶。角度取画传里常见的散势，两组不同向
  const CLUSTERS = [
    [26, 44, [[-32, 74, 7.5], [-6, 88, 8], [16, 70, 7], [40, 52, 6]]],
    [33, 92, [[-14, 66, 7], [12, 80, 7.5], [38, 58, 6]]],
    [38, 140, [[4, 58, 6.5], [30, 70, 7], [56, 48, 5.5]]],
  ];
  for (const [cx, cy, leaves] of CLUSTERS)
    for (const [a, len, w] of leaves) add(leafPath(cx, cy, a, len, w), 'zleaf');
}
/* ── 香炉上的烟 ──────────────────────────────────
   换掉了第一版的 canvas 粒子。粒子那版是几十个径向渐变的圆团，
   凑近看就是一串泡泡 —— 烟的形状不是团，是被气流揉过的带。

   现在用的是做烟的通行办法：一条竖着的软带当源图，
   过 feTurbulence 生成分形噪声，再用 feDisplacementMap 拿噪声去
   推那条带的每个像素 —— 推出来的边缘是分形的，那才像烟。
   噪声的 baseFrequency 用 SMIL 慢慢变，烟就活了；
   这一步交给浏览器的滤镜管线，我这边一行每帧的代码都不用写。

   代价是滤镜有面积成本，所以整块只有一百三十见方，
   而且 stdDeviation 压到 1.2 —— 再高手机上会掉帧。 */
function smokeSVG(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return '';
  return `<defs>
    <filter id="zsmk" x="-60%" y="-25%" width="220%" height="150%">
      <feTurbulence type="fractalNoise" baseFrequency="0.022 0.05"
                    numOctaves="3" seed="11" result="n">
        <animate attributeName="baseFrequency"
                 values="0.022 0.05;0.030 0.062;0.019 0.046;0.022 0.05"
                 dur="19s" repeatCount="indefinite"/>
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="30"
                         xChannelSelector="R" yChannelSelector="G"/>
      <feGaussianBlur stdDeviation="1.2"/>
    </filter>
    <linearGradient id="zsmkg" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="rgba(38,34,29,.42)"/>
      <stop offset=".45" stop-color="rgba(38,34,29,.16)"/>
      <stop offset="1" stop-color="rgba(38,34,29,0)"/>
    </linearGradient>
  </defs>
  <g id="zsmoke" filter="url(#zsmk)" fill="url(#zsmkg)">
    ${[[52, 3.0, 0], [66, 3.6, -3.5], [80, 2.6, 2.5]].map(([x, w, dx], i) => `
    <path d="M${x - w} 34 C${x - w * 2 + dx} 4 ${x + w * 2 + dx} -14
             ${x + dx} -46 C${x - w * 1.4 + dx} -12 ${x + w * 1.6} 6 ${x + w} 34Z">
      <animateTransform attributeName="transform" type="translate"
        values="0 6;0 -4;0 6" dur="${7 + i * 2.5}s" repeatCount="indefinite"/>
    </path>`).join('')}
  </g>`;
}

/** 下拉、提示文字、盘上那一格的高亮，三处保持一致。 */
function syncAsk(name){
  const sel = $('zaskq');
  if (sel && sel.value !== name){
    const has = [...sel.options].some(o => o.value === name);
    sel.value = has ? name : '';
  }
  const row = ZASK.find(z => z[0] === name);
  const hint = $('zaskhint');
  if (hint) hint.textContent = row ? row[2] : '';
  document.querySelectorAll('#zgrid .zp').forEach(
    e => e.classList.toggle('asked', e.dataset.pal === name));
}

/* ── 解读 ───────────────────────────────────────── */
/* 十二宫各管一摊，问题跟宫本来就是一一对应的 ——
   只是没人会说「我想看我的官禄宫」。下拉里写人话，选中之后
   跳到那一宫的解读，同时把盘上那一格框出来。 */
const ZASK = [
  ['命宫', '我 是 个 什 么 样 的 人', '整张盘的起点：性情、长相、遇事的第一反应。'],
  ['夫妻', '感 情 与 婚 姻',       '看伴侣，也看你在关系里会怎么使劲。'],
  ['官禄', '事 业 往 哪 儿 走',     '不是「能不能成」，是「往哪个方向使劲更顺」。'],
  ['财帛', '钱 怎 么 来',          '看路子与节奏，不看数目 —— 一张盘算不出数目。'],
  ['福德', '过 得 舒 不 舒 服',     '古人把这一宫看得很重：日子好不好，常写在这儿。'],
  ['疾厄', '身 体 与 消 耗',       '看薄弱处，也看你怎么把自己耗掉。这里不写病名。'],
  ['迁移', '出 门 在 外 顺 不 顺',   '远行、搬迁、换环境。有人是动一动才开。'],
  ['田宅', '住 处 与 家 里',       '房子、住的地方，也看家里的气氛与你攒得下什么。'],
  ['子女', '孩 子 与 我 做 的 东 西', '古法把生育与创作放在同一宫 —— 都是从你这儿生出来的。'],
  ['父母', '和 长 辈 的 关 系',     '父母与权威，也看上头有没有人替你挡。'],
  ['兄弟', '平 辈 与 合 伙',       '兄弟姐妹，也看跟人合伙时的分寸。'],
  ['交友', '朋 友 与 下 属',       '古称仆役宫。看你跟不是平辈的人怎么处。'],
];

function read(palace){
  const box = $('zbody');
  const L = [];
  const c = chart;
  const P = palace || c.palaces.find(p => p.name === '命宫');

  L.push(['zh', `${P.name}　${GAN[P.gan]}${ZHI[P.zhi]}`
    + (P.isShen ? '　身宫同宫' : '')]);
  L.push(['zn', palace ? '点盘上任何一宫，这里换成那一宫。'
                       : '预设看命宫。点盘上任何一宫，这里跟着换。']);

  /* 每一条都写成「依据 → 所以」。
     依据是这一宫真实的排盘结果：干支、坐了哪几颗星、有没有四化；
     所以是那一条落到人身上是什么样。

     反馈是「只有一项给了依据和所以，我想要每一项都有理有据」——
     说得对。原来只有照镜子那一段是这个形状，主星、辅煞、大限、五行局
     还是「词条 + 解释」的说明书口气。现在全部统一：
     说得出凭什么，下面那句才不是算命先生的话术。

     星的性情要跟「这一宫是哪一块」拼在一起才算数 ——
     「七杀主开创」是分类，「你的亲密关系那一块必有一次大变动」才是话。 */
  const SHORT = PALACE_SHORT[P.name] || P.name;
  const gz = `${GAN[P.gan]}${ZHI[P.zhi]}`;
  const at = extra => `${P.name}在${ZHI[P.zhi]}（${gz}）` + (extra || '');
  const fill = t => t.replace(/\{宫\}/g, SHORT);
  const say = (why, so) => L.push(['zm', why, so]);

  const pw = PALACE_WHY[P.name];
  say(at(P.isShen ? '，身宫同宫' : ''), pw[0] + pw[1]
      + (P.isShen ? '　身宫也在这一宫：古法说命宫是先天、身宫是后天，'
                  + '两者同宫的人，性情与作为比较一致，不太有「装」的余地。' : ''));

  const tbl = STAR_MIRROR[P.name];
  const mains = P.stars.filter(s => s.kind === '主');
  const aux = P.stars.filter(s => s.kind !== '主');
  const opp = c.palaces.find(x => x.zhi === (P.zhi + 6) % 12);
  const oppMain = opp ? opp.stars.filter(s => s.kind === '主') : [];

  // ── 主星 ──
  /* 命、夫妻、官禄、财帛四宫另有逐星写死的一段，比拼出来的贴身得多 ——
     那一段用「像不像你」挂个名，别的宫就还叫主星。 */
  const hasMirror = !!tbl && (mains.some(x => tbl[x.name])
                              || oppMain.some(x => tbl[x.name]));
  L.push(['zk', mains.length
    ? (hasMirror ? '主 星 · 像 不 像 你' : '主 星')
    : '空 宫 · 借 对 宫']);
  if (!mains.length){
    say(at('无主星') + (oppMain.length
        ? `　对宫${opp.name}（${ZHI[opp.zhi]}）坐 ${oppMain.map(x => x.name).join('、')}`
        : ''),
      EMPTY_MIRROR);
    for (const st of oppMain){
      const w = STAR_WHY[st.name];
      say(`借对宫的${st.name}${st.hua ? `（化${st.hua}）` : ''}`,
          (tbl && tbl[st.name]) ? tbl[st.name] : fill(w[1]));
    }
  } else {
    for (const st of mains){
      const w = STAR_WHY[st.name];
      const why = at(`坐${st.name}`)
        + (st.hua ? `，${st.name}化${st.hua}` : '')
        + (mains.length > 1
           ? `　同宫另有 ${mains.filter(x => x !== st).map(x => x.name).join('、')}`
           : '');
      // 命、夫妻、官禄、财帛四宫另有逐星写死的一段，比拼出来的更贴身
      say(why, (tbl && tbl[st.name]) ? tbl[st.name] : fill(w[1]));
      if (st.hua){
        const h = HUA_WHY[st.hua];
        say(`年干${c.ganzhi[0]}使${st.name}化${st.hua}，落在${P.name}`,
            h[1].replace(/这一块|这一/g, m => m === '这一块' ? SHORT : '这一')
            + `（${h[0]}）`);
      }
    }
  }

  // ── 辅煞 ──
  if (aux.length){
    L.push(['zk', '辅 星 与 煞 星']);
    for (const st of aux)
      say(`${st.name}在${ZHI[P.zhi]}，与${P.name}同宫`
          + (st.hua ? `，化${st.hua}` : ''),
          (AUX_WHY[st.name] || '') + `落在${P.name}，说的就是${SHORT}这一块。`);
  }

  // ── 大限 ──
  L.push(['zk', '大 限']);
  say(`${P.daxian[0]} 至 ${P.daxian[1]} 岁　`
    + `起运 ${c.ju} 岁（${c.juName}）　${c.forward ? '顺' : '逆'}行`
    + `（${c.male ? '乾造' : '坤造'}逢${c.ganzhi[0]}年，`
    + `${c.forward ? '阳男阴女顺' : '阴男阳女逆'}）`,
    `这十年走到${P.name}。传统上把当值的那一宫当成那十年的「命宫」看 ——`
    + `也就是说，${P.daxian[0]} 到 ${P.daxian[1]} 岁这一段，`
    + `${SHORT}会被顶到你生活的正中间：`
    + `不管你想不想，那些年的事多半绕着它转。`);

  // ── 五行局 ──
  const ju = JU_WHY[c.ju];
  L.push(['zk', '五 行 局']);
  say(`命宫 ${GAN[c.palaces[0].gan]}${ZHI[c.ming]}，纳音属${c.elem}，`
    + `故为${c.juName}（局数 ${c.ju}）`,
    ju[1] + `局数同时决定两件事：安紫微怎么算，以及几岁起运 ——`
    + `你是 ${c.ju} 岁起的，比火六局早、比水二局晚。`);

  L.push(['zf', '推法是有定规的，说法是传统的。'
    + '本站安紫微一步对照古法五个定局表逐日核过，一百五十项全中；'
    + '农历那一层另有二十九个春节、十个闰月的验证。'
    + '至于「某星在某宫主什么」，那是七百年来的说法，不是事实判断。']);

  box.innerHTML = L.map(([k, a, b]) =>
    k === 'zb' ? `<div class="zr zb"><div class="zt">${a}</div><div class="zd">${b}</div></div>`
    : k === 'zm' ? `<div class="zr zm"><div class="zw">${a}</div><div class="zc">${b}</div></div>`
               : `<div class="zr ${k}">${a}</div>`).join('');
  gsap.killTweensOf('#zbody .zr');
  gsap.fromTo('#zbody .zr',
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: .4, ease: 'power2.out', stagger: .04 });
}

/* ── 装配 ───────────────────────────────────────── */
export function mount(){
  // 上次填过就用上次那个。乾坤也记，它跟生辰一样是排盘的输入。
  if (SAVED){
    if (SAVED.hh != null) $('zh').value = SAVED.hh;
    if (SAVED.mi != null) $('zmin').value = SAVED.mi;
    if (SAVED.male != null){
      const r = document.querySelector(
        `input[name=zsex][value=${SAVED.male ? 'm' : 'f'}]`);
      if (r) r.checked = true;
    }
  }
  calendar();
  $('zsrcbody').innerHTML =
    `<h4>${STANCE.head}</h4><p>${STANCE.body.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`
    + `<h4>农历怎么来的</h4><p>不抄年表。朔由日月黄经差过零求得，中气由太阳黄经过`
    + `三十度整倍数求得，用清代以来行用的定朔定气规则。日界按东八区。</p>`
    + `<h4>字体</h4><p>霞鹜文楷，SIL Open Font License 1.1，`
    + `已裁到只剩本站用到的字。<a href="https://github.com/lxgw/LxgwWenKai" `
    + `target="_blank" rel="noopener">项目地址</a></p>`
    + `<h4>动效</h4><p>GSAP 3.15，GreenSock 标准授权（2025 年 4 月起全部免费）。`
    + `<a href="https://gsap.com/standard-license" target="_blank" rel="noopener">授权条款</a></p>`;

  bamboo(document.querySelector('.zbam-a'));
  bamboo(document.querySelector('.zbam-b'));

  /* 我想问：填选项、接事件。 */
  const zs = $('zaskq');
  for (const [pal, label] of ZASK){
    const o = document.createElement('option');
    o.value = pal; o.textContent = label; zs.appendChild(o);
  }
  zs.addEventListener('change', () => {
    if (!chart) return;
    const p = chart.palaces.find(x => x.name === zs.value);
    syncAsk(zs.value); read(p);
    if (matchMedia('(max-width: 860px)').matches)
      document.body.classList.remove('zread-off');
  });

  $('zcast').addEventListener('click', () => {
    run();
    if (matchMedia('(max-width: 820px)').matches) document.body.classList.add('zform-off');
  });
  $('zformtoggle').addEventListener('click',
    () => document.body.classList.toggle('zform-off'));
  $('zreadtoggle').addEventListener('click',
    () => document.body.classList.toggle('zread-off'));
  $('zsrcbtn').addEventListener('click', () => $('zsrc').classList.add('on'));
  $('zsrcclose').addEventListener('click', () => $('zsrc').classList.remove('on'));
  $('zsrc').addEventListener('click', e => {
    if (e.target === $('zsrc')) $('zsrc').classList.remove('on');
  });
  // 手机上生辰栏默认收起，先让人看见盘
  if (matchMedia('(max-width: 820px)').matches) document.body.classList.add('zform-off');
  run();
}
