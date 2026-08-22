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
import { cast, ZHI, GAN } from './ziwei.js?v=14e7fb9d';
import { PALACE_WHY, STAR_WHY, AUX_WHY, HUA_WHY, JU_WHY, STANCE } from './ziwei.text.js?v=93705896';

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
let pick = { y: 2000, m: 1, d: 1 };
let calY = 2000, calM = 1;

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
}

/* ── 起盘与画盘 ─────────────────────────────────── */
function run(){
  const hh = +$('zh').value, mi = +$('zmin').value;
  const male = document.querySelector('input[name=zsex]:checked').value === 'm';
  const c = cast(pick.y, pick.m, pick.d, hh, mi, male);
  if (!c){ $('zlunar').textContent = '此日期超出可算范围。'; return; }
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
          /* 香炉在中宫底下，烟从三根香上起。摆在文字后面，不挡读。
             炉是三足双耳的样子，线描，不填色 —— 这一页是纸不是画。 */
          + `<canvas id="zsmoke"></canvas>`
          + `<svg id="zcenser" viewBox="0 0 132 92" aria-hidden="true">`
          + `<path class="zxiang" d="M52 34V12M66 34V6M80 34V13"/>`
          + `<path class="zbody" d="M32 38 Q32 68 50 76 L82 76 Q100 68 100 38Z"/>`
          + `<path d="M24 38H108"/>`
          + `<path d="M24 34 q-10 -3 -10 -11 q0 -8 8 -8 q7 0 7 7"/>`
          + `<path d="M108 34 q10 -3 10 -11 q0 -8 -8 -8 q-7 0 -7 7"/>`
          + `<path d="M45 76 l-5 12M66 77 v12M87 76 l5 12"/>`
          + `<path d="M38 46 Q66 53 94 46"/>`
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
  smoke();
}

/* ── 香炉上的烟 ──────────────────────────────────
   为什么用 canvas 而不是 svg 滤镜：feTurbulence 做烟确实像，
   但要动起来得每帧改 baseFrequency，那是整片区域重新滤波，
   在手机上很贵。三十来个粒子画成径向渐变的小团，一样是烟，
   代价小两个数量级。

   烟的样子不是随便飘：起点抖动小、越往上越散、越往上越淡，
   横向用一条慢正弦加一点随机 —— 直着上去像水汽，摆得太厉害像特效。 */
let smokeTicker = null;
function smoke(){
  const cv = $('zsmoke');
  if (!cv) return;
  if (smokeTicker){ gsap.ticker.remove(smokeTicker); smokeTicker = null; }
  const ctx = cv.getContext('2d');
  const DPR = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, ps = [];
  const N = matchMedia('(max-width: 860px)').matches ? 16 : 30;

  const seed = () => {
    const r = cv.getBoundingClientRect();
    W = cv.width = Math.max(1, Math.round(r.width * DPR));
    H = cv.height = Math.max(1, Math.round(r.height * DPR));
  };
  const born = (i) => ({
    // 三根香，出生点就在那三根的顶上
    x: W * (0.395 + (i % 3) * 0.105),
    y: H,
    r: (3 + Math.random() * 3) * DPR,
    v: (0.22 + Math.random() * 0.3) * DPR,
    p: Math.random() * 6.283,
    w: 0.6 + Math.random() * 0.9,          // 摆动快慢
    a: 0.055 + Math.random() * 0.05,       // 起始浓度
    life: 0,
    span: 240 + Math.random() * 200,
  });
  seed();
  ps = Array.from({ length: N }, (_, i) => {
    const q = born(i); q.life = Math.random() * q.span; return q;   // 错开，别一起冒
  });

  const paint = () => {
    if (!cv.isConnected){ gsap.ticker.remove(paint); smokeTicker = null; return; }
    if (cv.width !== Math.round(cv.getBoundingClientRect().width * DPR)) seed();
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < ps.length; i++){
      const s = ps[i];
      s.life++;
      if (s.life > s.span){ ps[i] = born(i); continue; }
      const t = s.life / s.span;                 // 0→1
      s.y -= s.v;
      const drift = Math.sin(s.p + s.life * 0.012 * s.w) * 9 * DPR * t;
      const x = s.x + drift;
      const r = s.r * (1 + t * 5.5);             // 越往上越散
      const a = s.a * (1 - t) * Math.min(1, t * 6);   // 出生时淡入，末了淡出
      const g = ctx.createRadialGradient(x, s.y, 0, x, s.y, r);
      g.addColorStop(0, `rgba(38,34,29,${a.toFixed(4)})`);
      g.addColorStop(1, 'rgba(38,34,29,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, s.y, r, 0, 6.283); ctx.fill();
    }
  };
  // 开了「减少动态」就只留一缕静态的，不动
  if (matchMedia('(prefers-reduced-motion: reduce)').matches){ paint(); return; }
  smokeTicker = paint;
  gsap.ticker.add(paint);
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

  const pw = PALACE_WHY[P.name];
  L.push(['zb', '这一宫管什么', pw[0] + pw[1]]);

  if (!P.stars.length){
    L.push(['zk', '空 宫']);
    L.push(['zb', '此宫无星',
      '传统上叫空宫，不作凶论 —— 改看对宫（隔六位那一宫）的星，'
      + '谓之「借星安宫」。空宫的意思是这一块没有固定的脾气，'
      + '更容易被别处牵着走。']);
    const opp = c.palaces.find(p => p.zhi === (P.zhi + 6) % 12);
    if (opp && opp.stars.length)
      L.push(['zb', `对宫 ${opp.name}（${ZHI[opp.zhi]}）`,
        '借过来看的是：' + opp.stars.map(s => s.name).join('、')]);
  } else {
    const main = P.stars.filter(s => s.kind === '主');
    const aux = P.stars.filter(s => s.kind !== '主');
    if (main.length){
      L.push(['zk', '主 星']);
      for (const s of main){
        const w = STAR_WHY[s.name];
        L.push(['zb', s.name + (s.hua ? `　化${s.hua}` : ''), w[0] + w[1]]);
        if (s.hua){
          const h = HUA_WHY[s.hua];
          L.push(['zn', h[0] + h[1]]);
        }
      }
    }
    if (aux.length){
      L.push(['zk', '辅 煞']);
      for (const s of aux)
        L.push(['zb', s.name + (s.hua ? `　化${s.hua}` : ''), AUX_WHY[s.name] || '']);
    }
  }

  L.push(['zk', '大 限']);
  L.push(['zb', `${P.daxian[0]} 至 ${P.daxian[1]} 岁`,
    `大限自命宫起，起运岁即五行局数（此盘 ${c.ju}），每宫十年，`
    + `${c.forward ? '顺' : '逆'}行 —— ${c.male ? '男' : '女'}命逢`
    + `${c.ganzhi[0]}年（${c.forward ? '阳男阴女顺' : '阴男阳女逆'}）。`
    + `走到这一宫时，传统上就把这一宫当作那十年的「命宫」来看。`]);

  const ju = JU_WHY[c.ju];
  L.push(['zk', '五 行 局']);
  L.push(['zb', ju[0], ju[1]]);
  L.push(['zn', `五行局由命宫的纳音定：命宫 ${GAN[c.palaces[0].gan]}${ZHI[c.ming]}，`
    + `纳音属${c.elem}，故为${c.juName}。局数同时决定安紫微的算法与起运岁。`]);

  L.push(['zf', '推法是有定规的，说法是传统的。'
    + '本站安紫微一步对照古法五个定局表逐日核过，一百五十项全中；'
    + '农历那一层另有二十九个春节、十个闰月的验证。'
    + '至于「某星在某宫主什么」，那是七百年来的说法，不是事实判断。']);

  box.innerHTML = L.map(([k, a, b]) =>
    k === 'zb' ? `<div class="zr zb"><div class="zt">${a}</div><div class="zd">${b}</div></div>`
               : `<div class="zr ${k}">${a}</div>`).join('');
  gsap.killTweensOf('#zread .zr');
  gsap.fromTo('#zread .zr',
    { opacity: 0, y: 8 },
    { opacity: 1, y: 0, duration: .4, ease: 'power2.out', stagger: .04 });
}

/* ── 装配 ───────────────────────────────────────── */
export function mount(){
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
