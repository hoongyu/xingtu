/* 出生星空卡 / 抬头日签 —— 画成一张能存下来发出去的图。
 *
 * 为什么用 canvas 而不是把 DOM 截图：
 * 要传播就得是一张真的图片文件（微信、小红书都只认图），
 * 而 DOM 截图要么带库要么带 CORS 麻烦。canvas 直接 toBlob 出 PNG，
 * 零依赖，而且排版精度完全在自己手里 —— 这一点是这张卡的命门：
 * 它不能看起来像随手画的网页。
 *
 * 排版上守的几条（这几条就是「有设计感」与「没有」的分界）：
 *
 * 一、**一套栅格**。页边距、圆窗直径、每一行的基线都从同一个模数来，
 *     不是「看着差不多」。模数取页宽的十二分之一。
 * 二、**层级只留四级**：大字（日期）、正文（那句话）、小字（数据）、
 *     极小字（立场）。多一级就散。
 * 三、**只有两个彩色**：金与朱。别的全是墨色的不同透明度。
 * 四、**日期用中文数字**。「二〇〇〇年一月一日」和「2000-01-01」
 *     是两种东西，后者是表单，前者才是卡。
 * 五、**细节行是设计的一部分**，不是补充说明。恒星时、儒略日这些
 *     摆在那儿，卡才有「仪器」的质地 —— 这是这个站一贯的语气。
 * 六、不用渐变、不用发光、不用投影。这个站的语言是深底上的细线。
 *
 * 圆窗里画的是真的天：那一刻、那个地方，地平线以上的星。
 * 不是装饰性的星点 —— 是把赤经赤纬换算成地平坐标之后画出来的。
 */

const NUM = '〇一二三四五六七八九';
const CN_M = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九',
              '十', '冬', '腊'];
const CN_D = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八',
              '初九', '初十', '十一', '十二', '十三', '十四', '十五', '十六',
              '十七', '十八', '十九', '二十', '廿一', '廿二', '廿三', '廿四',
              '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const ZHI = '子丑寅卯辰巳午未申酉戌亥';

/** 年份逐位写：二〇〇〇。月日按口语写：一月一日、十二月廿五 —— 不对，
    公历日子还是逐位读着别扭，用「十」进位的中文数写法。 */
const cnDigits = n => String(n).split('').map(d => NUM[+d]).join('');
function cnSmall(n){                      // 1..31 的中文写法
  if (n <= 10) return NUM[n];
  if (n < 20) return '十' + (n % 10 ? NUM[n % 10] : '');
  return NUM[Math.floor(n / 10)] + '十' + (n % 10 ? NUM[n % 10] : '');
}

const rad = d => d * Math.PI / 180;

/* ── 地平坐标 ────────────────────────────────────
   圆窗要画的是「那一刻站在那儿抬头看见的天」，所以得把赤经赤纬
   换成地平高度与方位。公式是球面三角的标准式，不是近似：
       sin(高度) = sin(赤纬)sin(纬度) + cos(赤纬)cos(纬度)cos(时角)
   时角 = 当地恒星时 − 赤经。 */
function altaz(ra, dec, lstDeg, latDeg){
  const H = rad(lstDeg - ra), d = rad(dec), phi = rad(latDeg);
  const sinAlt = Math.sin(d) * Math.sin(phi) + Math.cos(d) * Math.cos(phi) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H),
                        Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(H));
  return [alt * 180 / Math.PI, ((az * 180 / Math.PI) + 360) % 360];
}

/** 天顶等距投影：天顶在圆心，地平线在圆周。上北下南，左东右西 ——
    这是抬头看的方向（跟低头看地图正好左右相反，画星图都这么摆）。 */
function domeXY(alt, az, R){
  const r = (90 - alt) / 90 * R;
  const a = rad(az);
  return [-Math.sin(a) * r, -Math.cos(a) * r];
}

/* ── 画卡 ────────────────────────────────────── */
const INK = '#e8e2d4', GOLD = '#d9b45f', ZHU = '#c9503f', VOID = '#05070c';

/** 画一张卡。spec 描述内容，尺寸与栅格在这里定死。 */
export function draw(cv, spec, scale = 2){
  const W = spec.square ? 1080 : 1080;
  const H = spec.square ? 1080 : 1620;
  const M = W / 12;                       // 模数：页边距与所有间距的来源
  cv.width = W * scale; cv.height = H * scale;
  const c = cv.getContext('2d');
  c.setTransform(scale, 0, 0, scale, 0, 0);

  const kai = (px, w = 400) => `${w} ${px}px "LXGW WenKai Subset","Songti SC","SimSun",serif`;
  const hei = px => `${px}px "PingFang SC","Microsoft YaHei",sans-serif`;

  // 底
  c.fillStyle = VOID; c.fillRect(0, 0, W, H);

  // 细边框。内缩半个模数 —— 版画的做法，一下就不像网页了
  c.strokeStyle = 'rgba(232,226,212,.22)'; c.lineWidth = 1;
  c.strokeRect(M / 2, M / 2, W - M, H - M);
  c.strokeStyle = 'rgba(217,180,95,.30)';
  c.strokeRect(M / 2 + 6, M / 2 + 6, W - M - 12, H - M - 12);

  let y = M * 1.35;

  // 抬头：标题 + 右侧一行竖排
  c.fillStyle = GOLD; c.font = kai(46);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.letterSpacing = '0.34em';
  c.fillText(spec.title, M, y);
  c.letterSpacing = '0px';
  c.strokeStyle = 'rgba(217,180,95,.5)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(M, y + 20); c.lineTo(M + 190, y + 20); c.stroke();

  if (spec.side){
    c.fillStyle = 'rgba(232,226,212,.42)'; c.font = kai(20);
    c.textAlign = 'center';
    let sy = M * 1.1;
    for (const ch of spec.side){ c.fillText(ch, W - M - 8, sy); sy += 28; }
  }

  // ── 圆窗：那一刻的天 ─────────────────────────
  /* 方卡（日签）矮五百多像素，圆窗得跟着收，不然底下几段挤不下。
     第一版方卡就是这么撞的：引文的基线跑到 1072，卡才 1080 高。 */
  const R = spec.square ? W * 0.245 : W * 0.335;
  const cx = W / 2, cy = y + (spec.square ? 44 : 62) + R;
  drawDome(c, cx, cy, R, spec);

  y = cy + R + M * (spec.square ? 0.66 : 0.9);

  // ── 日期。整张卡最大的字 ─────────────────────
  c.textAlign = 'left'; c.fillStyle = INK; c.font = kai(spec.square ? 44 : 52);
  c.letterSpacing = '0.06em';
  c.fillText(spec.big, M, y);
  c.letterSpacing = '0px';
  y += spec.square ? 40 : 46;
  c.fillStyle = 'rgba(232,226,212,.66)'; c.font = kai(spec.square ? 23 : 26);
  for (const line of spec.sub){ c.fillText(line, M, y); y += spec.square ? 33 : 38; }

  // ── 那句话。朱线引出来的一段，这是被转发的那部分 ──
  const LH = spec.square ? 40 : 48;
  if (spec.quote){
    y += M * (spec.square ? 0.30 : 0.42);
    const qx = M + 22, qw = W - M * 2 - 22;
    c.font = kai(spec.square ? 26 : 30);
    // 方卡地方小，引文最多三行，多的截掉 —— 截断比溢出好看
    let lines = wrap(c, spec.quote, qw);
    if (spec.square && lines.length > 3){
      lines = lines.slice(0, 3);
      lines[2] = lines[2].slice(0, -1) + '…';
    }
    const qh = lines.length * LH;
    c.strokeStyle = ZHU; c.lineWidth = 3;
    c.beginPath(); c.moveTo(M, y - LH * 0.62); c.lineTo(M, y - LH * 0.62 + qh); c.stroke();
    c.fillStyle = INK;
    for (const l of lines){ c.fillText(l, qx, y); y += LH; }
  }

  /* 细节行。原来直接按「距底边多少」摆，方卡上就跟引文叠在一起了 ——
     现在取「距底边」与「接着上文往下」两者的较大值，撞不了。 */
  y = Math.max(y + M * 0.46, H - M * (spec.square ? 1.55 : 1.85));
  c.strokeStyle = 'rgba(232,226,212,.14)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(M, y - 34); c.lineTo(W - M, y - 34); c.stroke();
  c.font = hei(spec.square ? 19 : 21); c.fillStyle = 'rgba(232,226,212,.56)';
  for (const l of spec.fine){ c.fillText(l, M, y); y += spec.square ? 27 : 30; }

  // ── 立场一行 + 朱印 ─────────────────────────
  c.font = kai(19); c.fillStyle = 'rgba(232,226,212,.36)';
  c.letterSpacing = '0.1em';
  c.fillText(spec.stance, M, H - M * 0.72);
  c.letterSpacing = '0px';
  seal(c, W - M - 46, H - M * 0.72 - 44, 46);
}

/** 朱文方印。两个字，阳文 —— 印是这张卡唯一允许的「装饰」，
    因为它同时是落款：这张图是从哪儿出来的。 */
function seal(c, x, y, s){
  c.save();
  c.strokeStyle = ZHU; c.lineWidth = 2.4;
  c.strokeRect(x, y, s, s);
  c.fillStyle = ZHU;
  c.font = `500 ${s * 0.40}px "LXGW WenKai Subset","Songti SC",serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('星', x + s * 0.5, y + s * 0.29);
  c.fillText('图', x + s * 0.5, y + s * 0.71);
  c.restore();
}

/** 圆窗里的天。地平线以上的星，天顶在圆心。 */
function drawDome(c, cx, cy, R, spec){
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, 6.2832);
  c.fillStyle = 'rgba(14,19,31,.9)'; c.fill();
  c.clip();

  const { lst, lat, stars, groups, bodies } = spec.sky;

  // 高度圈：三十度、六十度。淡到几乎看不见，但它让圆窗有深度
  c.strokeStyle = 'rgba(232,226,212,.08)'; c.lineWidth = 1;
  for (const a of [30, 60]){
    c.beginPath(); c.arc(cx, cy, (90 - a) / 90 * R, 0, 6.2832); c.stroke();
  }
  // 子午线与卯酉线
  c.beginPath();
  c.moveTo(cx - R, cy); c.lineTo(cx + R, cy);
  c.moveTo(cx, cy - R); c.lineTo(cx, cy + R);
  c.stroke();

  // 星官连线先画，压在星点底下
  if (groups){
    c.strokeStyle = 'rgba(217,180,95,.30)'; c.lineWidth = 1.1;
    c.beginPath();
    for (const g of groups)
      for (const line of g){
        let started = false;
        for (const hip of line){
          const f = stars[hip]; if (!f) { started = false; continue; }
          const [alt, az] = altaz(f[0], f[1], lst, lat);
          if (alt <= 2){ started = false; continue; }
          const [x, yy] = domeXY(alt, az, R);
          started ? c.lineTo(cx + x, cy + yy) : c.moveTo(cx + x, cy + yy);
          started = true;
        }
      }
    c.stroke();
  }

  // 星点。亮的大、暗的小，跟正文那张图同一套编码
  c.fillStyle = INK;
  for (const hip in stars){
    const f = stars[hip];
    const [alt, az] = altaz(f[0], f[1], lst, lat);
    if (alt <= 0) continue;
    const [x, yy] = domeXY(alt, az, R);
    const mag = f[2];
    c.globalAlpha = Math.max(.22, 1 - mag * .17);
    c.beginPath();
    c.arc(cx + x, cy + yy, Math.max(.7, 2.9 - mag * .48), 0, 6.2832);
    c.fill();
  }
  c.globalAlpha = 1;

  // 七政：金色小圈带名，这是「你那一刻的行星」
  if (bodies){
    for (const [name, b] of bodies){
      const [alt, az] = altaz(b.ra, b.dec, lst, lat);
      if (alt <= 0) continue;
      const [x, yy] = domeXY(alt, az, R);
      c.strokeStyle = GOLD; c.lineWidth = 1.4;
      c.beginPath(); c.arc(cx + x, cy + yy, 7, 0, 6.2832); c.stroke();
      c.fillStyle = GOLD;
      c.font = '17px "LXGW WenKai Subset","Songti SC",serif';
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillText(name, cx + x, cy + yy - 13);
    }
  }
  c.restore();

  // 地平圈与四方。四个字压在圈上，是这张窗的坐标
  c.strokeStyle = 'rgba(232,226,212,.30)'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.stroke();
  c.fillStyle = 'rgba(232,226,212,.5)';
  c.font = '20px "LXGW WenKai Subset","Songti SC",serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const [az, ch] of [[0, '北'], [90, '东'], [180, '南'], [270, '西']]){
    const [x, yy] = domeXY(-6, az, R);
    c.save();
    c.fillStyle = VOID;
    c.beginPath(); c.arc(cx + x, cy + yy, 15, 0, 6.2832); c.fill();
    c.restore();
    c.fillStyle = 'rgba(232,226,212,.55)';
    c.fillText(ch, cx + x, cy + yy);
  }
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
}

/** 按宽度折行。中文没有词边界，逐字量宽最稳。 */
function wrap(c, text, w){
  const out = [];
  let line = '';
  for (const ch of text){
    if (ch === '\n'){ out.push(line); line = ''; continue; }
    if (c.measureText(line + ch).width > w && line){ out.push(line); line = ''; }
    line += ch;
  }
  if (line) out.push(line);
  return out;
}

/* ── 存下来 ──────────────────────────────────────
   微信内置浏览器把 <a download> 拦掉了，桌面浏览器则正常。
   所以两条路都留：能下就下，不能下就把图铺出来让人长按保存。
   这是中文场景里唯一靠得住的做法。 */
export function present(cv, filename, host){
  host.innerHTML = '';
  cv.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url; img.alt = filename;
    img.className = 'cardimg';
    host.appendChild(img);

    const bar = document.createElement('div');
    bar.className = 'cardbar';
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.textContent = '存 图';
    a.className = 'cardsave';
    const tip = document.createElement('span');
    tip.className = 'cardtip';
    tip.textContent = '手机上长按图片也能存';
    bar.append(a, tip);
    host.appendChild(bar);
  }, 'image/png');
}

/** 字体没到就画，出来的是系统字 —— 这张卡的一半是字，等得起。 */
export async function ready(){
  if (!document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load('400 52px "LXGW WenKai Subset"'),
      document.fonts.load('500 46px "LXGW WenKai Subset"'),
    ]);
    await document.fonts.ready;
  } catch (_){ /* 字体加载失败不该挡住出图 */ }
}

export { cnDigits, cnSmall, CN_M, CN_D, ZHI, altaz };
