/* 概念星图配置：人工智能。
 *
 * 跟 sky.config.js 对照着看最清楚 —— 同一个引擎，换掉的就是这几个函数。
 * 最要紧的一处：坐标不是算出来的，是数据直接给的。引擎只认 [x, y]。
 */

export const CFG = {
  R: 380,
  data: 'conceptdata.json',
  culture: 'lineage',
  tier: 1,
  cultures: [['lineage', '技术谱系'], ['pipeline', '训练流水线']],
  // 档位 = 难度上限。对应星图里选观测地纬度。
  tiers: [['入门', 0], ['进阶', 1], ['研究', 2], ['全部', 3]],
  // 「同一批点、两种划法」是这份数据的主张 —— 切一下划法就少掉几十个
  // 概念的话，这句话就不成立了。
  pointSet: 'all',

  // 布局在 scripts/build_concept.py 里算好：半径=抽象层级，角度=领域扇区
  project: (x, y) => [x, y],
  // f = [x, y, 重要度, 难度, 层级, 扇区]；重要度越小越重要，跟星等同构
  radius: f => Math.max(.6, 3.2 - f[2] * .55),
  dim: f => Math.max(.30, 1 - f[2] * .17),
  // 概念的 id 是字符串，不能像 HIP 那样直接取模
  phase: id => {
    const h = [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0);
    return [2.6 + h % 40 / 9, h % 31 / 8];
  },
  visible: (f, maxHard) => f[3] <= maxHard,
  /* 「超出当前难度」不是「看不见」。星图用暗红标地平线以下的星，
     那是事实判断；这张图上同样的红会说成「这块不该你看」——
     入门档下 161 个里有 73 个，近一半的图变成红的。换一抹冷蓝，
     意思回到「在更深处，还没走到」。 */
  belowFill: 'rgba(132,168,204,.62)',

  rings: D => [
    [D.meta.levels[1], 'gui', '一层 · 主干'],
    [D.meta.levels[2], 'gui equator', '二层 · 方法'],
    [D.meta.levels[3], 'gui', '三层 · 技术'],
    [D.meta.outer, 'gui horizon', '四层 · 术语'],
  ],

  tipRows(id, D, below){
    const [, , , hard, lv, sec] = D.stars[id];
    return `<div class="nm">${D.names[id]}</div>`
      + `<div><span class="k">层级</span><span class="v">${lv}</span></div>`
      + `<div><span class="k">领域</span><span class="v">${D.meta.sectors[sec]}</span></div>`
      + `<div><span class="k">难度</span><span class="v">${['浅','中','深','专'][hard]}</span></div>`
      + (D.notes[id] ? `<div class="note">${D.notes[id]}</div>` : '')
      + (below ? `<div class="warn">比当前档更深 —— 右上角换档就点得开</div>` : '');
  },

  facts(g, D, maxHard, tierName){
    const n = g._members.size;
    const over = [...g._members].filter(h => D.stars[h][3] > maxHard).length;
    return `<span>概念 <b>${n}</b> 个</span>`
      + (over ? `<span style="color:var(--zhu)">其中 `
              + `<b style="color:var(--zhu)">${over}</b> 个超出「${tierName}」</span>` : '');
  },

credits:
    '<h4>概念表与两种划法</h4>'
  + '<p>本项目整理。161 个关键词，一套按技术谱系划，一套按训练流水线划 —— '
  + '同一批点，两种读法。</p>'

  + '<h4>渲染引擎</h4>'
  + '<p>与星图同一个 engine.js。这份数据是它的第二个用例 —— '
  + '引擎里那些可配置的口子，都是做这份数据时真的卡住才开的。</p>'

  + '<p class="fine">坐标不是算法排出来的：半径 = 抽象层级，角度 = 领域扇区，'
  + '两种划法都不参与定位。要是按其中一种排，那一种会好看得不诚实。</p>',

  text: {
    title: '概 念 星 图',
    placeholder: '搜概念、线索…',
    hint: c => c === 'lineage' ? '点 一 条 线 索' : '点 一 段 流 程',
    tag: c => c === 'lineage' ? '谱系' : '流水线',
    siteLabel: '难 度',
    lost: n => `更深的档位里还有 ${n} 个`,
    noLore: '这条线索还没写说明。',
    back: '← 退 回 全 图',
    guide: '点旁边任何一个暗的关键词 → 直接跳到它所在的那条线索　·　'
         + '点线索名看说明　·　左上角退回全图，或按 Esc',
    firstrun: ['亮着的是有说明的线索，点它进去',
               '进去之后点旁边暗的关键词，会换到它所在的那条线索',
               '左边名单与检索栏可以直接跳'],
    noBrief: '尚无说明。',
  },

  rail: [
    ['训 练 流 水 线',
     ['立题','备数据','定表示','选架构','定目标','跑训练',
      '上规模','调适配','压上线','量效果','管风险']],
    ['技 术 谱 系',
     ['计算的边界','因果','统计学习','符号与搜索','神经网络起源',
      '训练工程','卷积与视觉','循环与序列','注意力','语言模型',
      '表示学习','生成模型谱系','强化学习','学习范式谱','架构新支',
      '规模化','推理效率','多模态','智能体','评测方法','对齐','可信']],
  ],
};
