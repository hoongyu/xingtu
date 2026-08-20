"""把 308 个中国星官按名字语义归族，决定各自用什么笔法画。

为什么要分族，而不是一个一个画：
  308 个里 54 个只有 1 颗星、47 个只有 2 颗。一两个点撑不起一幅象形 ——
  硬画就是凭空发明，跟当初否掉天秤座是同一个理由。所以：
    ≥5 颗星  → 依星位作图（象形）
    2-4 颗   → 按名字给图标，放在质心、沿主轴定向、按跨度缩放
    1 颗     → 同上，尺寸固定
  图标不是假装的解剖结构，是「这里是什么」的记号，这个界限要守住。

规则按顺序匹配，先中先得，所以特例写在前面。
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

# (族名, 正则)。顺序即优先级。
RULES = [
    # ── 先扣掉二十八宿本身，它们归四象，不走图标 ──
    ('mansion', r'^(角|亢|氐|房|心|尾|箕|斗|牛|女|虚|危|室|壁|奎|娄|胃|昴|毕|觜|参|井|鬼|柳|星|张|翼|轸)宿$'),

    # ── 动物 ──
    ('serpent', r'螣蛇|蛇首|蛇腹|蛇尾|腾蛇'),
    ('turtle',  r'^龟$|^鳖$'),
    ('bird',    r'鹤|孔雀|火鸟|异雀|野鸡|天鸡|鸟喙|^燕$'),
    ('fish',    r'飞鱼|金鱼|^鱼$|海石|水委'),
    ('bug',     r'蜜蜂'),
    ('dog',     r'^狗$|狗国|天狗|天狼'),
    ('horse',   r'马尾|马腹|天马|^房$'),
    ('beast',   r'青丘|^虎'),

    # ── 人物：帝王 / 官吏 / 女眷 / 武人 ──
    ('emperor', r'帝座|五帝座|五帝内座|帝席|天皇大帝|太乙|天乙|太尊|太子|诸王|北极|勾陈|太阳守'),
    ('warrior', r'将军|虎贲|骑阵|羽林|军市|军南门|积卒|骑官|天弁|郎将|候$'),
    ('lady',    r'御女|女史|织女|女床|天床|离珠|婺女'),
    ('official', r'三公|九卿|尚书|郎位|谒者|大理|^相$|柱史|宦者|幸臣|从官|三师|四辅|'
                 r'司命|司禄|司危|司非|内平|宗人|宗正|少微|^势$|常陈|五诸侯|十二国|'
                 r'九州殊口|七公|^宗$|^子$|^孙$|丈人|老人|^人$|王良|造父|傅说|'
                 r'附路|天纪|天理|内阶|六甲|文昌|三台|上台|中台|下台|太史|天柱|'
                 r'左摄提|右摄提|摄提|大角|梗河|招摇|玄戈|天枪'),

    # ── 兵器与刑具 ──
    ('weapon',  r'弧矢|天棓|钺|𫓧|锧|^罚$|^伐|天纲|天谗|杵|砺石|^斧'),
    ('banner',  r'旗|九斿|^杠|华盖|^幡'),

    # ── 车船 ──
    ('boat',    r'天船|南船|^船'),
    ('cart',    r'车府|阵车|车骑|奚仲|五车|辇道|阁道|传舍|天驷|天厩|天高'),

    # ── 建筑与器物 ──
    ('wall',    r'垣$|长垣|垒壁阵|^屏$|内屏|外屏|库楼|天垒城'),
    ('gate',    r'门$|阙丘|天街|天关|天钥|天籥|键闭|阳门|平道'),
    ('hall',    r'明堂|灵台|离宫|市楼|列肆|车肆|屠肆|天牢|天溷|^厕$|坟墓|内厨|外厨|'
                r'天厨|天社|周鼎|帛度|^斛$|^臼$|天钱|天床|渐台|^建$|^衡$|^斗$|'
                r'^小斗$|天弁|天籥|天棓|天桴|天节|天钩|^杵|败臼|^糠$'),
    ('granary', r'天仓|天廪|天囷|天园|天苑|天田|八谷|刍藁|积薪|败瓜|瓠瓜|天庾|军井|'
                r'^井$|玉井|水府|水位|天渊|九坎|罗堰|天潢|咸池|天阴|天溷'),

    # ── 天象 ──
    ('sky',     r'雷电|霹雳|云雨|^日$|^月$|天江|四渎|积水|天阿|天乳|天记|天泣|^哭$|^泣$'),

    # ── 兜底：几何记号 ──
    ('mark',    r'.'),
]

# 逐名指派，优先于规则。二十八宿按本义走 —— 名字本身就是具象的
# （斗、井、箕、毕、柳、角、轸……），落不到具体物的才退回「宿」记号。
OVERRIDE = {
    '角宿': 'horn',   '亢宿': 'mansion', '氐宿': 'mound',   '房宿': 'hall',
    '心宿': 'mansion', '尾宿': 'mansion', '箕宿': 'basket',
    '斗宿': 'ladle',  '牛宿': 'beast',   '女宿': 'lady',    '虚宿': 'mansion',
    '危宿': 'mansion', '室宿': 'hall',   '壁宿': 'wall',
    '奎宿': 'mansion', '娄宿': 'mansion', '胃宿': 'granary', '昴宿': 'mansion',
    '毕宿': 'net',    '觜宿': 'bird',    '参宿': 'warrior',
    '井宿': 'well',   '鬼宿': 'mound',   '柳宿': 'tree',    '星宿': 'mansion',
    '张宿': 'net',    '翼宿': 'bird',    '轸宿': 'cart',

    # 兜底里挑得出物的
    '北斗': 'ladle',  '小斗': 'ladle',   '斗': 'ladle',     '南斗': 'ladle',
    '贯索': 'rope',   '罗堰': 'rope',    '八魁': 'net',     '天纲': 'net',
    '大陵': 'mound',  '坟墓(附危宿)': 'mound', '积尸(胃宿)': 'mound',
    '天垒城': 'wall', '长垣': 'wall',
    '玉井': 'well',   '军井': 'well',    '天井': 'well',    '亢池': 'well',
    '青丘': 'tree',   '扶筐': 'basket',  '天籥': 'gate',
    '轩辕': 'beast',  '天樽': 'hall',    '爟': 'sky',       '海山': 'mound',
    '东咸': 'gate',   '西咸': 'gate',    '天辐': 'cart',    '天相': 'official',
    '土公': 'official', '土公吏': 'official', '土司空': 'official',
    '进贤': 'official', '策': 'official', '柱史': 'official',
    '左辖(附轸宿)': 'cart', '右辖(附轸宿)': 'cart', '长沙(附轸宿)': 'cart',
    '附耳(附毕宿)': 'net', '辅(附北斗)': 'ladle',
    '河鼓': 'warrior', '天津': 'boat',   '南河': 'sky',     '北河': 'sky',
    '天渊': 'sky',    '积水(胃宿)': 'sky', '积水(井宿)': 'sky',
    '卷舌': 'horn',   '折威': 'weapon',  '司怪': 'official',
    '虚梁': 'hall',   '盖屋': 'hall',    '平': 'official',  '平道': 'gate',
    '顿顽': 'mark',   '附白': 'mark',    '夹白': 'mark',    '离瑜': 'mark',
    '屎': 'mark',     '三角形': 'mark',  '十字架': 'mark',
    '波斯': 'boat',   '左更': 'official', '右更': 'official',
    '柱(角宿)': 'hall', '柱(毕宿)': 'hall',
}

COMPILED = [(k, re.compile(p)) for k, p in RULES]


def family(name):
    """去掉括号里的归属注记再匹配，如「柱(角宿)」「伐(附参宿)」。"""
    if name in OVERRIDE:
        return OVERRIDE[name]
    bare = re.sub(r'[（(].*?[)）]', '', name)
    for k, rx in COMPILED:
        if rx.search(bare):
            return k
    return 'mark'


def main():
    d = json.loads((ROOT / 'web' / 'skydata.json').read_text(encoding='utf-8'))
    groups = d['cultures']['cn']['groups']
    buckets = {}
    for g in groups:
        n = len({h for l in g['lines'] for h in l})
        buckets.setdefault(family(g['name']), []).append((n, g['name']))

    total = 0
    for k, v in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        v.sort(reverse=True)
        total += len(v)
        big = sum(1 for n, _ in v if n >= 5)
        print(f"{k:<9} {len(v):>3} 个（≥5 星 {big:>2}）  "
              + ' '.join(nm for _, nm in v[:9]) + (' …' if len(v) > 9 else ''))
    print(f"\n合计 {total} / {len(groups)}")
    mark = buckets.get('mark', [])
    if mark:
        print(f"\n落到兜底 mark 的 {len(mark)} 个：")
        for i in range(0, len(mark), 8):
            print('  ' + '  '.join(nm for _, nm in mark[i:i + 8]))


if __name__ == '__main__':
    main()


# ── 西方星座的后备族 ──
# 85 座有 Meuris 的插画，正常用不到这些。但投影会撕开南天的星座，
# 那时插画尺度失控必须丢弃 —— 丢了得有东西顶上，所以 88 座全都备一份。
IAU_RULES = [
    ('serpent', r'巨蛇|蛇夫|长蛇|水蛇|天龙|蝎虎'),
    ('bird',    r'天鹅|天鹰|孔雀|天鹤|凤凰|杜鹃|天鸽|乌鸦|天燕'),
    ('fish',    r'双鱼|南鱼|飞鱼|剑鱼|鲸鱼|海豚'),
    ('bug',     r'苍蝇|蝘蜓|巨蟹|天蝎'),
    ('dog',     r'大犬|小犬|猎犬'),
    ('horse',   r'小马|飞马'),
    ('beast',   r'大熊|小熊|狮子|小狮|天猫|豺狼|鹿豹|麒麟|半人马|摩羯|白羊|金牛|天兔'),
    ('warrior', r'猎户|人马'),
    ('lady',    r'仙女|仙后|室女|后发'),
    ('emperor', r'仙王'),
    ('official', r'英仙|武仙|牧夫|御夫|双子|印第安|蛇夫'),
    ('boat',    r'船底|船尾|船帆|南船'),
    ('weapon',  r'天箭|天弓'),
    ('banner',  r'天琴|天秤'),
    ('hall',    r'天坛|巨爵|宝瓶'),
    ('mound',   r'山案|玉夫|天炉'),
    ('sky',     r'波江'),
    ('mansion', r'北冕|南冕'),
    ('wall',    r'盾牌'),
    ('mark',    r'.'),
]
IAU_COMPILED = [(k, re.compile(p)) for k, p in IAU_RULES]


def iau_family(name):
    for k, rx in IAU_COMPILED:
        if rx.search(name):
            return k
    return 'mark'
