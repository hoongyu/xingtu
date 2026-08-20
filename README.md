# 星图引擎

一套「点 + 折线 + 分组」的探索式渲染引擎，外加两份跑通它的数据集。

线上： <https://hoongyu.github.io/xingtu/>　（GitHub Pages，推 main 自动部署）

> 推上去之后**十分钟内看到的可能还是旧的**。GitHub Pages 给 HTML 发
> `Cache-Control: max-age=600` 且不认 `_headers`，改不了。资源指纹防的是
> 「改了没生效」，防不了「HTML 本身被缓存」—— 旧 HTML 会老老实实去拿
> 旧指纹的那份资源，整套是自洽的旧版本，不会坏，只是旧。
> 想立刻验证就在网址后面加个 `?v=2` 之类的查询串绕开。

- **星图** —— 中国星官 308 个、西方星座 88 个，同一批星的两种划法
- **概念星图** —— 「人工智能」拆成 161 个关键词，同一批词的两种划法
- **星盘** —— 行星位置真算，西洋按黄道十二宫、中式按赤道二十八宿，同一批行星的两套坐标

前两个共用 `engine.js`。星盘自成一套 —— 圆环加扇区是另一种图元，
硬塞进引擎会比单独写更糟，这是引擎边界所在。

两份数据共用同一个 `engine.js`。差别全在各自的配置文件里。

```
web/
  engine.js            渲染引擎（不认天文，也不认 AI）
  engine.css           样式
  sky.config.js        星图配置
  concept.config.js    概念星图配置
  index.html           星图        ← 一行 mount(CFG)
  concept.html         概念星图    ← 一行 mount(CFG)
  astro.html           星盘（自成一套：盘面是圆环+扇区，不走引擎）
  ephem.js             历表：行星位置计算
  astro.js             排盘与解读
  skydata.json         167 KB
  conceptdata.json      33 KB
  art/                 85 张星座插画 + CREDITS.md（Free Art License，必读）
scripts/
  build_skydata.py     星表 + 星官连线 + 插画锚点 → skydata.json
  build_concept.py     概念表 + 两种划法 + 极坐标布局 → conceptdata.json
  lore.py / lore_more.py   星官与星座的来历 396 条（构建时并入 skydata.json）
  starnotes.py         单颗星的天文事实 52 条
  build_astro.py       星盘词条与二十八宿分度 → astrodata.json
  build_card.py        分享缩略图 card.png
  stamp.py             给静态资源打内容指纹，绕开浏览器缓存
  preview_*.py         渲成独立 SVG 用来肉眼验收（浏览器截不到图时用）
  parked/              下架的自绘象形工具链，附下架原因
data/
  source/              上游数据副本，提交号锁在 ART_COMMIT.txt
```

## 引擎认什么

数据的形状：

```jsonc
{
  "stars":  { "<id>": [x, y, ...任意字段] },   // 前两位是位置，其余由配置解释
  "names":  { "<id>": "显示名" },
  "lore":   { "<组名>": "讲解" },        // 源在 scripts/lore.py，构建时并入
  "cultures": {
    "<划法key>": { "label": "划法名", "groups": [
      { "name": "组名", "lines": [["<id>", "<id>", ...]], "art": {...} }
    ]}
  }
}
```

**引擎不管布局。** 它只认「一个点有 `[x, y]`」。星图的坐标来自北极方位等距
投影，概念星图的来自极坐标排布（半径=抽象层级，角度=领域扇区），都是调用方
算好再喂进来。一旦引擎自己管布局，它就变成了另一个图布局库，
而布局质量是研究问题不是产品问题。

配置要给的（对照 `sky.config.js` / `concept.config.js` 看最清楚）：

| 口子 | 星图 | 概念星图 |
|---|---|---|
| `project(a,b)` | 投影算 | 直接返回 `[a,b]` |
| `pointSet` | `byCulture`（两套文化本来就用不同的星） | `all`（同一批点，两种划法） |
| `radius(f)` / `dim(f)` | 星等 | 重要度 |
| `visible(f, tier)` | 赤纬 vs 观测地纬度 | 难度 vs 难度档 |
| `tiers` | 六个城市 | 入门/进阶/研究/全部 |
| `rings(D, tier)` | 恒显圈 / 赤道 / 外规 | 四道抽象层级圈 |
| `tipRows` / `facts` | 星等赤经赤纬 | 层级领域难度 |
| `artUsable` | 判断星座是否被投影撕开 | 不给（没有插画） |
| `rail` / `text` | 黄道十三宫、二十八宿… | 流水线、技术谱系… |

这张表不是设想出来的。做法是先**复制一份页面硬改成第二个数据集**，
两份页面当时 87% 的行相同、38 处不同，那 38 处就是这里的口子。
只有一份数据集时抽出来的接口必然是错的 —— 会把星图的偶然当成本质。

## 跑

```bash
python scripts/build_skydata.py      # -> web/skydata.json
python scripts/build_concept.py      # -> web/conceptdata.json
python -m http.server 8777 --directory web
```

`/` 是星图，`/concept.html` 是概念星图。

## 数据来源与授权

| | 来源 | 授权 |
|---|---|---|
| 星表坐标 | NADC 中国古天文基础参考星表 (DOI 10.12149/100877) | CC BY 4.0 |
| 星官与连线 | Stellarium sky cultures | CC BY-SA 4.0 |
| 星座插画 85 张 | Johan Meuris / Stellarium | **Free Art License 1.3** |
| 概念数据与讲解 | 本项目 | — |

插画那条有一个**工程约束**：Free Art License 第 4 条规定，作品若在成品中
无法被单独取用，整个成品必须一并采用该许可证。所以 `web/art/` 下的图
**必须作为独立文件发布** —— 不要内联成 data URI、不要打进 JS bundle、
不要拼成雪碧图。详见 `web/art/CREDITS.md`。


## 星盘那一页的立场

**行星位置是真算的。** JPL 的行星近似轨道根数 + Meeus 的日月级数，
1800–2050 年适用。校验方式是拿它对三次日全食与两次月全食：
日食时日月黄经相差 0.04–0.06 度，月食时相差 179.96–180.00 度。

**怎么解读那个位置，是传统的说法。** 占星是一套有两千多年历史的文化系统，
但它不是预测科学。页面把两者分开标注，词条写的是「传统上认为」。

出生日期、时间、地点全部在浏览器里算，不上传。地点用内置城市表，
不调第三方地理编码 —— 那是个人数据。
