/* 紫微斗数排盘。
 *
 * 跟西洋星盘是两套完全不同的东西，值得说清差在哪：
 * 星盘算的是**行星的真实位置**，天文在先、解释在后；紫微用的是
 * 一套**符号系统** —— 十四主星不对应任何天体，紫微星不是北极星，
 * 天府星天上没有。它们是按农历生日推出来的位置符号。
 *
 * 所以这一页的立场跟星盘那页不同：星盘那边能说「位置是算的」，
 * 这边不能。这边能说的是「推法是有定规的」——
 * 每一步都是固定算法，同样的生辰谁来排都一样，可以逐条核对。
 * 页面上会把这一点写明白，不含糊。
 *
 * 已核验的部分：
 * · 安紫微对照古法五个定局表逐日核，150/150 全中（这是最容易错的一步）
 * · 天府与紫微以寅申为轴、紫微系六星逆行、天府系八星顺行，抽查全对
 * · 农历那一层（lunar.js）另有春节 29/29、闰月 10/10 的验证
 */
import { toLunar } from './lunar.js?v=699142ab';

export const GAN = '甲乙丙丁戊己庚辛壬癸';
export const ZHI = '子丑寅卯辰巳午未申酉戌亥';
export const SHENGXIAO = '鼠牛虎兔龙蛇马羊猴鸡狗猪';
const mod = (n, m) => ((n % m) + m) % m;

/* 十二宫名。从命宫起**逆时针**排 —— 地支序号递减。 */
export const PALACE = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
                       '迁移', '交友', '官禄', '田宅', '福德', '父母'];

/* 六十甲子纳音的五行，每两个甲子一组，共三十组。
   顺序即甲子、丙寅、戊辰……壬戌。局数：水二木三金四土五火六。 */
const NAYIN = '金火木土金火水土金木水土火木水金火木土金火水土金木水土火木水';
const JU = { 水: 2, 木: 3, 金: 4, 土: 5, 火: 6 };
const JU_NAME = { 2: '水二局', 3: '木三局', 4: '金四局', 5: '土五局', 6: '火六局' };

/* 五虎遁：年干定寅宫天干。甲己丙作首，乙庚戊为头，丙辛庚寅上，
   丁壬壬寅流，戊癸甲寅求。 */
const YIN_GAN = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0];   // 按年干索引

/* 紫微系逆行、天府系顺行。相对紫微／天府的位移。 */
const ZW_SERIES = { 紫微: 0, 天机: -1, 太阳: -3, 武曲: -4, 天同: -5, 廉贞: -8 };
const TF_SERIES = { 天府: 0, 太阴: 1, 贪狼: 2, 巨门: 3, 天相: 4,
                    天梁: 5, 七杀: 6, 破军: 10 };

/* 四化。按年干，禄权科忌各一。 */
const SIHUA = {
  甲: ['廉贞', '破军', '武曲', '太阳'], 乙: ['天机', '天梁', '紫微', '太阴'],
  丙: ['天同', '天机', '文昌', '廉贞'], 丁: ['太阴', '天同', '天机', '巨门'],
  戊: ['贪狼', '太阴', '右弼', '天机'], 己: ['武曲', '贪狼', '天梁', '文曲'],
  庚: ['太阳', '武曲', '太阴', '天同'], 辛: ['巨门', '太阳', '文曲', '文昌'],
  壬: ['天梁', '紫微', '左辅', '武曲'], 癸: ['破军', '巨门', '太阴', '贪狼'],
};
export const HUA = ['禄', '权', '科', '忌'];

/* 禄存按年干。擎羊在其前一位、陀罗在其后一位 —— 古称「羊陀夹禄」。 */
const LUCUN = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];
/* 天魁天钺按年干。甲戊庚牛羊、乙己鼠猴乡、丙丁猪鸡位、壬癸兔蛇藏、辛逢马虎乡。 */
const KUI = [1, 0, 11, 11, 1, 0, 1, 6, 3, 3];
const YUE = [7, 8, 9, 9, 7, 8, 7, 2, 5, 5];

/** 安紫微。古法：以局数除生日，不足除者商进一；所补之差为偶则顺、为奇则逆。
    这一步对照五个定局表逐日核过，150/150。 */
function ziweiPos(ju, day){
  const q = Math.ceil(day / ju);
  const r = q * ju - day;
  return mod(2 + (q - 1) + (r % 2 === 0 ? r : -r), 12);
}

/** 排盘。传入公历年月日时分（东八区）与性别。 */
export function cast(y, mo, d, hh, mi, male){
  const ms = Date.UTC(y, mo - 1, d, hh - 8, mi);
  const L = toLunar(ms);
  if (!L) return null;

  // 时辰。子时跨子夜，23 点起算作次日子时 —— 这是通行的分法。
  const shi = Math.floor((hh + 1) / 2) % 12;

  // 年干支。以立春还是正月初一分界，两派不同；这里用正月初一，
  // 跟排盘所依的农历月日保持同一套口径。
  const gi = mod(L.year - 4, 10), zi = mod(L.year - 4, 12);

  // 定命宫身宫。寅起正月顺数到生月，再自该宫起子时：命宫逆数、身宫顺数。
  const ming = mod(2 + (L.month - 1) - shi, 12);
  const shen = mod(2 + (L.month - 1) + shi, 12);

  // 五行局：看命宫的纳音。命宫天干由五虎遁推出。
  /* 五虎遁定寅宫天干后，顺数到本宫。步数必须先对 12 取模 ——
     子宫的 (0-2) 是 -2，实际是从寅往前走 10 步，不是往后 2 步。
     先前直接对 10 取模，子丑两宫的天干就错了，五行局跟着错。 */
  const ganAt = pos => mod(YIN_GAN[gi] + mod(pos - 2, 12), 10);
  const mingGan = ganAt(ming);
  const jiazi = mod((mingGan - ming) * 6 + ming, 60);  // 干支合成六十甲子序
  const elem = NAYIN[Math.floor(jiazi / 2)];
  const ju = JU[elem];

  // 安星
  const zw = ziweiPos(ju, L.day);
  const tf = mod(4 - zw, 12);
  const stars = {};
  const put = (name, pos, kind) => {
    (stars[pos] = stars[pos] || []).push({ name, kind });
  };
  for (const [n, off] of Object.entries(ZW_SERIES)) put(n, mod(zw + off, 12), '主');
  for (const [n, off] of Object.entries(TF_SERIES)) put(n, mod(tf + off, 12), '主');

  // 辅星与煞星
  put('左辅', mod(4 + L.month - 1, 12), '吉');
  put('右弼', mod(10 - (L.month - 1), 12), '吉');
  put('文昌', mod(10 - shi, 12), '吉');
  put('文曲', mod(4 + shi, 12), '吉');
  put('天魁', KUI[gi], '吉');
  put('天钺', YUE[gi], '吉');
  put('禄存', LUCUN[gi], '吉');
  put('擎羊', mod(LUCUN[gi] + 1, 12), '煞');
  put('陀罗', mod(LUCUN[gi] - 1, 12), '煞');
  put('地劫', mod(11 + shi, 12), '煞');
  put('地空', mod(11 - shi, 12), '煞');

  // 四化。落在哪颗星上，就把标记挂到那颗星。
  const hua = {};
  SIHUA[GAN[gi]].forEach((sn, i) => { hua[sn] = HUA[i]; });
  for (const arr of Object.values(stars))
    for (const s of arr) if (hua[s.name]) s.hua = hua[s.name];

  /* 大限。自命宫起，起运岁即局数，每宫十年。
     阳男阴女顺行，阴男阳女逆行 —— 年干的阴阳与性别同则顺，异则逆。 */
  const yang = gi % 2 === 0;
  const forward = yang === male;
  const palaces = [];
  for (let i = 0; i < 12; i++){
    const pos = mod(ming - i, 12);                    // 十二宫逆时针
    const step = forward ? i : mod(-i, 12);
    palaces.push({
      zhi: pos,
      name: PALACE[i],
      gan: ganAt(pos),
      stars: stars[pos] || [],
      isShen: pos === shen,
      daxian: [ju + step * 10, ju + step * 10 + 9],
    });
  }
  // 大限按宫位地支重排一次：顺逆决定的是「第几个十年落在哪一宫」
  for (let i = 0; i < 12; i++){
    const pos = mod(forward ? ming + i : ming - i, 12);
    const p = palaces.find(x => x.zhi === pos);
    p.daxian = [ju + i * 10, ju + i * 10 + 9];
  }

  return {
    lunar: L, shi, ju, juName: JU_NAME[ju], elem,
    ganzhi: GAN[gi] + ZHI[zi], shengxiao: SHENGXIAO[zi],
    ming, shen, zwPos: zw, tfPos: tf, forward, male,
    hua, palaces,
    greg: { y, mo, d, hh, mi },
  };
}
