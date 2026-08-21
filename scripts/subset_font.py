"""把中文字体裁到只剩本站用得上的那些字。

为什么要做：页面上写的是 font-family: "Songti SC","SimSun",serif —— 全是
系统字体栈。Mac 上是宋体，Windows 上是 SimSun，安卓上很可能什么都没有、
退到默认无衬线。古风感在手机上直接塌掉，而紫微那页最吃这一口。

为什么不用 Google Fonts：它在大陆访问不稳，而这站的主要入口是微信。
自托管。

完整中文字体两三千万字节，装不下也不该装。但这个站有个别人没有的条件：
**全站文字在构建时就已知**。扫一遍源码，取实际用到的那两千来个字，
其余四万四千个丢掉。

字体是霞鹜文楷（LXGW WenKai），SIL OFL 授权，允许子集化与再分发。
源文件二十四兆，不进仓库 —— 只有裁完的那份进。要重裁时从这里取：
    https://github.com/lxgw/LxgwWenKai/releases

两个用法：
    python scripts/subset_font.py <源字体路径>   裁一份新的
    python scripts/subset_font.py --check        只查覆盖，不需要源字体

--check 是给 CI 用的：它读已提交的那份 woff2，核对本站每个字都在里面。
加了新字忘了重裁，就在这里断掉 —— 否则线上会出现方框或退回系统字，
而且没有任何报错。
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
OUT = WEB / 'wenkai-subset.woff2'

# 扫这些地方。web 下是页面与数据，scripts 下是词条 —— 词条最终都会印到页上。
# 排除本文件：它的正则里写着区间端点字符，扫自己会把那两个端点
# 当成「用到的字」—— 自引用，第一次跑就撞上了。
SELF = pathlib.Path(__file__).name
SCAN = [
    *WEB.glob('*.html'), *WEB.glob('*.js'), *WEB.glob('*.json'),
    *(f for f in (ROOT / 'scripts').glob('*.py') if f.name != SELF),
]

# 常用符号与全角标点。这些不在正文扫描里也得留着，
# 否则某天加一个「※」就是一个方框。
EXTRA = (
    ' !"#$%&\'()*+,-./0123456789:;<=>?@'
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`'
    'abcdefghijklmnopqrstuvwxyz{|}~'
    '　、。〈〉《》「」『』【】〔〕・ー －—–…‥·※'
    '，．：；？！＂＇（）［］｛｝／＼｜＋＝＜＞＄％＃＆＊＠'
    '°′″℃±×÷≈≠≤≥∞√∑∏∫←↑→↓↔⇒⇔'
    '①②③④⑤⑥⑦⑧⑨⑩'
    '〇一二三四五六七八九十百千万亿'
)


def used_chars():
    """本站实际用到的字。只取会印到页面上的那些 —— 代码标识符是 ASCII，
    已经在 EXTRA 里；中文无论出现在字符串还是注释里都算，因为注释里的
    措辞常常就是页面上的措辞，宁可多留几十个字。"""
    s = set(EXTRA)
    for f in SCAN:
        try:
            t = f.read_text(encoding='utf-8')
        except Exception:
            continue
        # 中日韩统一表意文字 + 扩展 A + 兼容表意文字
        s |= set(re.findall(r'[㐀-䶿一-鿿豈-﫿]', t))
    return s


def build(src):
    from fontTools import subset
    chars = used_chars()
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.desubroutinize = True
    opts.layout_features = ['*']          # 保留全部排版特性，别把标点位置弄坏
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables += ['DSIG']
    font = subset.load_font(src, opts)
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(text=''.join(sorted(chars)))
    subsetter.subset(font)
    subset.save_font(font, str(OUT), opts)
    size = OUT.stat().st_size
    print(f'  用到的字符  {len(chars)} 个')
    print(f'  源字体      {pathlib.Path(src).stat().st_size / 1048576:.1f} MB')
    print(f'  子集        {size / 1024:.0f} KB  ({size / pathlib.Path(src).stat().st_size:.1%})')
    print(f'  -> {OUT.relative_to(ROOT)}')


def check():
    """只查覆盖。不需要源字体，所以 CI 不必下载二十四兆。"""
    from fontTools.ttLib import TTFont
    if not OUT.exists():
        print(f'::error::{OUT.name} 不存在。跑 python scripts/subset_font.py <源字体> 生成')
        return 1
    have = set(TTFont(str(OUT), lazy=True).getBestCmap())
    need = used_chars()
    miss = sorted(c for c in need if ord(c) not in have)
    if miss:
        shown = ''.join(miss[:60]) + ('…' if len(miss) > 60 else '')
        # 控制台可能是 GBK，缺的字未必印得出来 —— 印不出就退回码位
        try:
            shown.encode(sys.stdout.encoding or 'utf-8')
        except Exception:
            shown = ' '.join(f'U+{ord(c):04X}' for c in miss[:30])
        print(f'::error::字体子集少了 {len(miss)} 个字，加了新字之后要重裁：{shown}')
        print('  跑 python scripts/subset_font.py <源字体路径>')
        return 1
    print(f'字体子集覆盖检查通过：本站用到 {len(need)} 个字符，'
          f'子集含 {len(have)} 个，无遗漏')
    return 0


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--check':
        sys.exit(check())
    if len(sys.argv) < 2:
        sys.exit('用法：subset_font.py <源字体路径>  或  subset_font.py --check')
    build(sys.argv[1])
