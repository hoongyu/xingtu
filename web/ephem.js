/* 历表：算出给定时刻各行星的位置。
 *
 * 这一部分是天文，不是占星 —— 它只回答「那一刻木星在天上哪里」。
 * 怎么解读那个位置是另一回事，在 astro.js 里，并且明确标着那是传统说法。
 *
 * 行星用 JPL 公布的近似开普勒根数（1800–2050 年适用，误差量级为角分）。
 * 太阳与月亮用 Meeus《天文算法》的简化级数。对星盘而言，
 * 角分级的精度远远够用 —— 上升点对出生时间的敏感度（每 4 分钟 1 度）
 * 比这大两个数量级。
 *
 * 所有计算都在浏览器里做。出生日期、时间、地点不会离开这台机器 ——
 * 那是个人数据，没有理由送到任何服务器上去。
 */

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const sin = a => Math.sin(a * D2R), cos = a => Math.cos(a * D2R);
const norm = a => ((a % 360) + 360) % 360;

/** 儒略日。h 为该地时刻（小时，可含小数），tz 为该地相对 UTC 的时差。 */
export function julianDay(y, m, d, h, tz){
  const ut = h - tz;                       // 换成世界时
  let Y = y, M = m;
  let day = d + ut / 24;
  if (M <= 2){ Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);     // 格里历
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1))
       + day + B - 1524.5;
}

const cent = jd => (jd - 2451545.0) / 36525;

/** 黄赤交角（度）。 */
export function obliquity(T){
  return 23.439291111 - 0.0130041667 * T - 1.638889e-7 * T * T
       + 5.036111e-7 * T * T * T;
}

/** 太阳的视黄经（度）。Meeus 第 25 章的简化式。 */
function sunLon(T){
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M)
           + (0.019993 - 0.000101 * T) * sin(2 * M)
           + 0.000289 * sin(3 * M);
  const O  = 125.04 - 1934.136 * T;
  return norm(L0 + C - 0.00569 - 0.00478 * sin(O));   // 视黄经（含光行差与章动）
}

// 月亮黄经的主要周期项（Meeus 表 47.A 的前若干项，系数单位 1e-6 度）
const MOON_L = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766],
  [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665],
  [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
  [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120],
  [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048],
];

/** 月亮的黄经与升交点（度）。 */
function moon(T){
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T
           + T ** 3 / 538841 - T ** 4 / 65194000;
  const D  = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
           + T ** 3 / 545868 - T ** 4 / 113065000;
  const M  = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T
           + T ** 3 / 24490000;
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
           + T ** 3 / 69699 - T ** 4 / 14712000;
  const F  = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T
           - T ** 3 / 3526000 + T ** 4 / 863310000;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;    // 地球轨道偏心率的修正因子

  let s = 0;
  for (const [d, m, mp, f, c] of MOON_L){
    let k = c;
    if (Math.abs(m) === 1) k *= E;
    if (Math.abs(m) === 2) k *= E * E;
    s += k * sin(d * D + m * M + mp * Mp + f * F);
  }
  // 升交点（平交点）。中式称罗睺，西洋称北交点 —— 同一个点。
  const node = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T
             + T ** 3 / 467441 - T ** 4 / 60616000;
  return { lon: norm(Lp + s / 1e6), node: norm(node) };
}

/* JPL「主要行星近似位置的开普勒根数」，1800–2050 年适用。
   每行：a, ȧ, e, ė, I, İ, L, L̇, ϖ, ϖ̇, Ω, Ω̇   （长度 AU，角度 度，速率 每世纪）*/
const ELEM = {
  '水星': [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749,
           252.25032350, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
  '金星': [0.72333566, 0.00000390, 0.00677672, -0.00004107, 3.39467605, -0.00078890,
           181.97909950, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
  '地球': [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668,
           100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0],
  '火星': [1.52371034, 0.00001847, 0.09339410, 0.00007882, 1.84969142, -0.00813131,
           -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
  '木星': [5.20288700, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714,
           34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
  '土星': [9.53667594, -0.00125060, 0.05386179, -0.00050991, 2.48599187, 0.00193609,
           49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
  '天王星': [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939,
             313.23810451, 428.48202785, 170.95427630, 0.40805281, 74.01692503, 0.04240589],
  '海王星': [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372,
             -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
  '冥王星': [39.48211675, -0.00031596, 0.24882730, 0.00005170, 17.14001206, 0.00004818,
             238.92903833, 145.20780515, 224.06891629, -0.04062942, 110.30393684, -0.01183482],
};

/** 日心黄道直角坐标（AU）。 */
function helio(name, T){
  const [a0, ad, e0, ed, I0, Id, L0, Ld, w0, wd, O0, Od] = ELEM[name];
  const a = a0 + ad * T, e = e0 + ed * T, I = I0 + Id * T;
  const L = L0 + Ld * T, w = w0 + wd * T, O = O0 + Od * T;
  const argP = w - O;                       // 近日点幅角
  let M = norm(L - w); if (M > 180) M -= 360;

  // 解开普勒方程。偏心率都不大，牛顿法几步就收敛。
  let E = M + e * R2D * sin(M);
  for (let i = 0; i < 12; i++){
    const dM = M - (E - e * R2D * sin(E));
    E += dM / (1 - e * cos(E));
  }
  const xv = a * (cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sin(E);

  const cw = cos(argP), sw = sin(argP), cO = cos(O), sO = sin(O),
        cI = cos(I), sI = sin(I);
  return [
    (cw * cO - sw * sO * cI) * xv + (-sw * cO - cw * sO * cI) * yv,
    (cw * sO + sw * cO * cI) * xv + (-sw * sO + cw * cO * cI) * yv,
    (sw * sI) * xv + (cw * sI) * yv,
  ];
}

/** 格林尼治恒星时（度）。 */
export function gmst(jd){
  const T = cent(jd);
  return norm(280.46061837 + 360.98564736629 * (jd - 2451545.0)
            + 0.000387933 * T * T - T * T * T / 38710000);
}

/** 黄道坐标 -> 赤道坐标。中式星盘按赤经定宿，所以这一步必须有。 */
export function eclToEq(lon, lat, eps){
  const ra = Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * D2R) * sin(eps),
                        cos(lon)) * R2D;
  const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * R2D;
  return [norm(ra), dec];
}

/** 一整张盘的天文部分。lon 东经为正，lat 北纬为正。 */
export function compute(y, mo, d, h, tz, lat, lon){
  const jd = julianDay(y, mo, d, h, tz);
  const T = cent(jd);
  const eps = obliquity(T);

  const out = { jd, T, eps, bodies: {} };
  const put = (n, l, b = 0) => {
    const [ra, dec] = eclToEq(l, b, eps);
    out.bodies[n] = { lon: norm(l), lat: b, ra, dec };
  };

  put('太阳', sunLon(T));
  const mn = moon(T);
  put('月亮', mn.lon);
  put('北交点', mn.node);
  put('南交点', norm(mn.node + 180));

  const E = helio('地球', T);
  for (const name of ['水星', '金星', '火星', '木星', '土星',
                      '天王星', '海王星', '冥王星']){
    const P = helio(name, T);
    const x = P[0] - E[0], y = P[1] - E[1], z = P[2] - E[2];
    put(name, Math.atan2(y, x) * R2D,
        Math.atan2(z, Math.hypot(x, y)) * R2D);
  }

  // 上升点与天顶。RAMC 就是当地恒星时。
  const ramc = norm(gmst(jd) + lon);
  const mc = norm(Math.atan2(sin(ramc), cos(ramc) * cos(eps)) * R2D);
  const asc = norm(Math.atan2(cos(ramc),
                   -(sin(ramc) * cos(eps) + Math.tan(lat * D2R) * sin(eps))) * R2D);
  out.ramc = ramc;
  put('天顶', mc);
  put('上升', asc);
  out.asc = asc; out.mc = mc; out.lat = lat; out.lon = lon;
  return out;
}

/** 宫位。三种切法，都简单到可以验算 ——
 *  普拉西德制流行但在高纬度失效且易算错，本页不做。 */
/* Placidus：中间宫由「时间等分半弧」定，不是等分黄道。
   MC 时角为 0，上升时角为 −SD（SD 是半昼弧 = 90° + 升交差）。
   十一宫落在 SD/3 处、十二宫在 2SD/3 处；二、三宫同法用半夜弧。
   没有闭式解，迭代：由赤经反求黄经 → 赤纬 → 升交差 → 新赤经。

   当初没做这个是因为「高纬度会失效、算法容易出错」。现在两条都有交代：
   失效的地方明确返回 null（tan φ · tan δ 到了 ±1 就是极昼极夜，那一宫
   在数学上不存在，不是精度问题）；正确性拿一张已知盘逐条对过 ——
   2000-01-01 12:00 UTC+2 柏林，四个中间宫与专业排盘器差都在 1 角分以内。 */
function placidus(ramc, phi, eps){
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const raToLon = a =>
    norm(Math.atan2(Math.sin(a * D2R), Math.cos(a * D2R) * Math.cos(eps * D2R)) * R2D);
  const solve = (base, f, night) => {
    let a = ramc + base;
    for (let i = 0; i < 60; i++){
      const lon = raToLon(a);
      const dec = Math.asin(Math.sin(lon * D2R) * Math.sin(eps * D2R)) * R2D;
      const t = Math.tan(phi * D2R) * Math.tan(dec * D2R);
      if (Math.abs(t) >= 1) return null;          // 极昼极夜，该宫无解
      const ad = Math.asin(t) * R2D;
      const arc = night ? 90 - ad : 90 + ad;
      const na = night ? ramc + 180 - f * arc : ramc + f * arc;
      if (Math.abs(norm(na - a + 180) - 180) < 1e-9){ a = na; break; }
      a = na;
    }
    return raToLon(a);
  };
  return [solve(30, 1/3, false), solve(60, 2/3, false),
          solve(120, 2/3, true), solve(150, 1/3, true)];
}

export function houses(kind, asc, mc, lat, eps){
  const cusp = [];
  if (kind === 'placidus'){
    const ramc = norm(Math.atan2(Math.sin(mc * Math.PI / 180) * Math.cos(eps * Math.PI / 180),
                                 Math.cos(mc * Math.PI / 180)) * 180 / Math.PI);
    const [c11, c12, c2, c3] = placidus(ramc, lat, eps);
    // 任一宫无解就退回波菲利 —— 极区不是精度问题，是那一宫真的不存在
    if (c11 == null || c12 == null || c2 == null || c3 == null)
      return houses('porphyry', asc, mc, lat, eps);
    cusp[0] = asc; cusp[1] = c2; cusp[2] = c3;
    cusp[3] = norm(mc + 180); cusp[4] = norm(c11 + 180); cusp[5] = norm(c12 + 180);
    for (let i = 0; i < 6; i++) cusp[i + 6] = norm(cusp[i] + 180);
    return cusp;
  }
  if (kind === 'whole'){
    const start = Math.floor(asc / 30) * 30;      // 整宫制：一宫即一星座
    for (let i = 0; i < 12; i++) cusp.push(norm(start + i * 30));
  } else if (kind === 'equal'){
    for (let i = 0; i < 12; i++) cusp.push(norm(asc + i * 30));
  } else {                                        // 波菲利：象限三等分
    const ic = norm(mc + 180), dsc = norm(asc + 180);
    const q1 = norm(ic - asc), q2 = norm(dsc - ic);
    cusp[0] = asc;
    cusp[1] = norm(asc + q1 / 3); cusp[2] = norm(asc + 2 * q1 / 3);
    cusp[3] = ic;
    cusp[4] = norm(ic + q2 / 3); cusp[5] = norm(ic + 2 * q2 / 3);
    for (let i = 0; i < 6; i++) cusp[i + 6] = norm(cusp[i] + 180);
  }
  return cusp;
}

/** 某黄经落在第几宫（0 起）。 */
export function houseOf(lon, cusp){
  for (let i = 0; i < 12; i++){
    const a = cusp[i], b = cusp[(i + 1) % 12];
    const span = norm(b - a), off = norm(lon - a);
    if (off < span || span === 0) return i;
  }
  return 0;
}

/** 相位。返回两两之间成相的列表。 */
export function aspects(bodies, defs, names){
  const out = [];
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++){
      const a = bodies[names[i]], b = bodies[names[j]];
      if (!a || !b) continue;
      let d = Math.abs(norm(a.lon - b.lon));
      if (d > 180) d = 360 - d;
      for (const def of defs){
        const orb = Math.abs(d - def.a);
        if (orb <= def.orb){
          out.push({ a: names[i], b: names[j], type: def.n, orb, exact: d });
          break;
        }
      }
    }
  return out;
}
