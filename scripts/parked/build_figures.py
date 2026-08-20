"""生成 web/figures.js。

所有象形都由这里出，不手写 —— 396 个星官手画不完，而且手画必然风格漂移。
羽、鳞、节共用 plume.py 的笔法，所以「整体风格统一」是结构保证，不是自律。
"""
import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ribbon import ribbon
from plume import (wing, coverts, scales, segments, feather, shaft, along,
                   crest, head_wedge, circle)
from glyphs import FAMILY
from classify_cn import family, iau_family
from figframe import proj, D as SKY

OUT = pathlib.Path(__file__).resolve().parents[1] / 'web' / 'figures.js'


def J(xs):
    return ' '.join(xs)


FIG = {}

# ───────────────────────── 天鹅座 ─────────────────────────
# IAU 连线本身就是鸟形：天津一是胸，两翼各是「前缘→翼尖→后缘→尾」的
# 五点多边形。羽片排在这两个多边形里，所以每一枚都落在真实翼面上。
UP_LEAD = [(0.700, -0.128), (0.750, -0.409), (0.904, -0.695)]
UP_TRAIL = [(0.982, -0.068), (1.010, -0.220), (0.904, -0.695)]
LO_LEAD = [(0.708, 0.072), (0.664, 0.321), (0.818, 0.580), (0.828, 0.691)]
LO_TRAIL = [(0.982, 0.068), (0.909, 0.213), (0.828, 0.691)]

up_p, up_s = wing(UP_LEAD, UP_TRAIL, n=12, sweep=.15, w=.034, camber=.13)
lo_p, lo_s = wing(LO_LEAD, LO_TRAIL, n=12, sweep=.15, w=.034, camber=-.13)
up_c = coverts(UP_LEAD, UP_TRAIL, n=8, w=.026, frac=.34)
lo_c = coverts(LO_LEAD, LO_TRAIL, n=8, w=.026, frac=.34)

# 尾扇：七枚短羽自尾根散开
tail_p, tail_s = [], []
for k in range(7):
    f = (k + .5) / 7
    b = (0.968, -0.044 + .090 * f)
    e = (1.086, -0.062 + .134 * f)
    tail_p.append(feather(b, e, .020, .05))
    tail_s.append(shaft(b, e, .05))

CYG_D = (
    "M 0 0 C 0.018 -0.028 0.052 -0.050 0.096 -0.054 C 0.138 -0.056 0.168 -0.046 "
    "0.182 -0.030 C 0.330 -0.050 0.520 -0.076 0.658 -0.138 L 0.750 -0.409 "
    "L 0.904 -0.695 C 0.958 -0.606 0.992 -0.428 1.012 -0.220 C 1.016 -0.150 "
    "1.004 -0.098 0.986 -0.066 L 1.084 -0.050 L 1.092 0.004 L 1.076 0.064 "
    "L 0.984 0.070 C 0.960 0.128 0.934 0.176 0.909 0.213 C 0.882 0.390 0.854 "
    "0.550 0.828 0.691 L 0.818 0.580 L 0.664 0.321 C 0.692 0.228 0.708 0.148 "
    "0.714 0.076 C 0.560 0.050 0.330 0.034 0.182 0.028 C 0.140 0.026 0.096 "
    "0.020 0.062 0.012 Z")

# 颈背与胸腹两道结构线，让长颈不只是一条空管
CYG_VEIN = ("M0.106 -0.040 C0.300 -0.056 0.500 -0.078 0.660 -0.130 "
            "M0.108 0.020 C0.320 0.030 0.520 0.046 0.700 0.070 "
            "M0.700 -0.128 C0.760 -0.060 0.800 0.000 0.712 0.076")

CYG_BILL = ("M0 0 C0.012 -0.020 0.034 -0.032 0.058 -0.034 "
            "C0.062 -0.018 0.060 -0.004 0.052 0.006 "
            "C0.030 0.008 0.012 0.006 0 0 Z")

FIG['天鹅座'] = {
    'a': 95947, 'b': 102098,
    'marks': {95947: [0, 0], 100453: [0.736, -0.056], 102488: [0.750, -0.409],
              104732: [0.904, -0.695], 103413: [1.010, -0.220], 97165: [0.664, 0.321],
              95853: [0.818, 0.580], 94779: [0.828, 0.691], 99848: [0.909, 0.213],
              102098: [1.000, 0.000]},
    'd': CYG_D,
    'parts': [
        ['plume', J(up_p + lo_p + tail_p)],
        ['covert', J(up_c + lo_c)],
        ['vein', J(up_s + lo_s + tail_s) + ' ' + CYG_VEIN],
        ['dark', CYG_BILL],
        ['eye', circle(.086, -.024, .015)],
    ],
}

# ───────────────────────── 螣蛇 ─────────────────────────
# 21 颗星串成一条链，本来就是一条蛇。中线直接抄星位，一个点都不改。
SNAKE = [
    (0.000, 0.000), (-0.059, -0.081), (-0.507, -0.206), (-0.583, -0.085),
    (-0.885, 0.084), (-0.677, 0.345), (-0.510, 0.311), (-0.320, 0.389),
    (-0.131, 0.097), (0.640, 0.832), (0.524, 0.891), (0.417, 0.906),
    (0.293, 0.801), (0.035, 0.108), (0.368, 0.152), (0.480, 0.164),
    (0.549, 0.174), (0.859, 0.172), (0.949, 0.240), (0.980, 0.078),
    (1.000, 0.000),
]
SNAKE_HIP = [111169, 110609, 107533, 107136, 105064, 106886, 108165, 109857,
             110538, 118243, 117863, 117301, 115990, 111674, 113919, 114570,
             115022, 116584, 117221, 116805, 116631]
SNAKE_W = [.062, .064, .066, .065, .063, .061, .059, .057, .055, .051, .049,
           .047, .044, .041, .037, .034, .031, .025, .019, .011, .000]

snake_body = ribbon(SNAKE, SNAKE_W, n=6, tip=True)
snake_scale = scales(SNAKE, SNAKE_W, rows=40, k=.72, back=.85)

# 头。两件事决定它认不认得出来：
#   一、必须明显比颈粗 —— 颈半宽 .062，颌部 .098，一眼看得出「脖子—头」。
#   二、方向。顺着体轴伸出去正好戳进螣蛇十五那段身子，头会被自己盖住；
#      所以让它偏下扭开，扭进空处。蛇本来就会抬头转向，这不是迁就。
HD_ORIGIN, HD_DIR, HD_LEN = (0.0, 0.0), (0.90, -0.44), 0.30
HD_PROFILE = [(.00, .050), (.12, .047), (.32, .098), (.58, .092), (.82, .066), (1., .024)]
hd_pts, hd_ws, (hux, huy) = head_wedge(HD_ORIGIN, HD_DIR, HD_LEN, HD_PROFILE)
snake_head = ribbon(hd_pts, hd_ws, n=6, tip=False)

hnx, hny = -huy, hux                      # 头的法线：+ 为颌侧，- 为眼侧
def _hp(t, off):
    """头上取点：沿轴 t、法向偏移 off（按该处半宽的倍数）。"""
    i = min(int(t * (len(HD_PROFILE) - 1)), len(HD_PROFILE) - 2)
    f = t * (len(HD_PROFILE) - 1) - i
    w = HD_PROFILE[i][1] * (1 - f) + HD_PROFILE[i + 1][1] * f
    x = HD_ORIGIN[0] + hux * HD_LEN * t + hnx * w * off
    y = HD_ORIGIN[1] + huy * HD_LEN * t + hny * w * off
    return x, y

# 颌线：从吻端沿颌侧退回到颊角。蛇头最认得出来的一笔就是这条。
jaw = 'M' + ' L'.join(f"{x:.3f} {y:.3f}" for x, y in
                      (_hp(t, .62) for t in (1.0, .84, .66, .48, .33)))
snout = _hp(1.0, 0)
tip_ = (snout[0] + hux * .075, snout[1] + huy * .075)
TONGUE = (f"M{snout[0]:.3f} {snout[1]:.3f} L{tip_[0]:.3f} {tip_[1]:.3f} "
          f"M{tip_[0]:.3f} {tip_[1]:.3f} L{tip_[0]+hux*.055-hnx*.040:.3f} {tip_[1]+huy*.055-hny*.040:.3f} "
          f"M{tip_[0]:.3f} {tip_[1]:.3f} L{tip_[0]+hux*.050+hnx*.045:.3f} {tip_[1]+huy*.050+hny*.045:.3f}")
_nos = _hp(.90, -.30)
NOSTRIL = circle(_nos[0], _nos[1], .010)
_eye = _hp(.44, -.42)
EYE = circle(_eye[0], _eye[1], .032)
PUPIL = circle(_eye[0], _eye[1], .014)     # 同心，靠 circle() 保证

# 无足而飞。星图上没有翅膀的位置，所以给一道连续背鳍，不编造翅膀。
SNAKE_CREST = crest(SNAKE, SNAKE_W, t0=.04, t1=.60, amp=.058, waves=5.)

FIG['螣蛇'] = {
    'a': 111169, 'b': 116631,
    'marks': {h: [round(x, 3), round(y, 3)] for h, (x, y) in zip(SNAKE_HIP, SNAKE)},
    'd': snake_body + ' ' + snake_head,
    'parts': [
        ['covert', SNAKE_CREST],
        ['vein', J(snake_scale) + ' ' + jaw + ' ' + TONGUE],
        ['eye', EYE],
        ['dark', PUPIL + ' ' + NOSTRIL],
    ],
}

# ───────────────────────── 天蝎座 ─────────────────────────
SCO = [(0.000, 0.000), (0.090, -0.022), (0.180, -0.042), (0.252, -0.048),
       (0.313, -0.070), (0.400, -0.112), (0.459, -0.148), (0.489, -0.207),
       (0.532, -0.273), (0.630, -0.285), (0.704, -0.240), (0.830, -0.190),
       (0.935, -0.145)]
SCO_W = [.048, .070, .088, .090, .074, .058, .050, .044, .039, .034, .030, .025, .020]
HOOK = [(0.935, -0.145), (1.005, -0.057), (0.952, -0.062), (0.838, -0.081), (0.861, -0.067)]
HOOK_W = [.020, .017, .015, .013, .012]
STING = [(0.861, -0.067), (0.935, -0.030), (1.000, 0.000)]
CLAW_A = [(0.020, -0.012), (-0.013, -0.060), (-0.030, -0.113)]
NIP_A = [(-0.030, -0.113), (0.004, -0.150), (0.036, -0.152)]
CLAW_B = [(0.020, 0.012), (0.042, 0.049), (0.095, 0.057)]
NIP_B = [(0.095, 0.057), (0.100, 0.100), (0.076, 0.126)]

FIG['天蝎座'] = {
    'a': 78401, 'b': 87261,
    'marks': {78401: [0, 0], 80112: [0.180, -0.042], 80763: [0.252, -0.048],
              81266: [0.313, -0.070], 82396: [0.459, -0.148], 82514: [0.489, -0.207],
              82729: [0.532, -0.273], 84143: [0.704, -0.240], 86228: [0.935, -0.145],
              87073: [1.005, -0.057], 86670: [0.952, -0.062], 85696: [0.838, -0.081],
              85927: [0.861, -0.067], 87261: [1.000, 0.000], 78265: [-0.013, -0.060],
              78104: [-0.030, -0.113], 78820: [0.042, 0.049], 79374: [0.095, 0.057]},
    'd': J([ribbon(SCO, SCO_W, n=5, tip=False),
            ribbon(HOOK, HOOK_W, n=5, tip=False),
            ribbon(STING, [.024, .014, .000], n=4),
            ribbon(CLAW_A, [.030, .021, .013], n=4, tip=False),
            ribbon(NIP_A, [.013, .009, .000], n=4),
            ribbon(CLAW_B, [.030, .021, .013], n=4, tip=False),
            ribbon(NIP_B, [.013, .009, .000], n=4)]),
    'parts': [
        ['vein', J(segments(SCO, SCO_W, rows=11, k=.90)
                   + segments(HOOK, HOOK_W, rows=4, k=.90))],
        ['eye', circle(.034, -.026, .011) + ' ' + circle(.034, .014, .011)],
    ],
}

# ═══════════════ 中国星官：按族取图，按星位安放 ═══════════════
# 308 个星官各画一张既不现实也不该 —— 54 个只有 1 颗星、47 个只有 2 颗，
# 一两个点撑不起象形，硬画就是凭空发明（当初否掉天秤座是同一条理由）。
# 所以图形按「族」共用一份，每个星官只记「用哪族 + 放在哪 + 多大 + 朝哪」。
# 风格一致因此是结构保证的，文件也不会被 308 份路径撑爆。


def _axis(hips):
    """主轴：协方差矩阵的主特征向量。返回轴两端的 hip、半跨度与轴向。

    用主轴而不是包围盒 —— 星官多是细长的链，斜着的链用包围盒会算成
    一个大方块，图形跟着放大到离谱。
    """
    P = [proj(*SKY['stars'][str(h)][:2]) for h in hips]
    cx = sum(q[0] for q in P) / len(P)
    cy = sum(q[1] for q in P) / len(P)
    sxx = sum((q[0] - cx) ** 2 for q in P)
    syy = sum((q[1] - cy) ** 2 for q in P)
    sxy = sum((q[0] - cx) * (q[1] - cy) for q in P)
    ang = .5 * math.atan2(2 * sxy, sxx - syy)
    ex, ey = math.cos(ang), math.sin(ang)
    t = [(q[0] - cx) * ex + (q[1] - cy) * ey for q in P]
    lo, hi = t.index(min(t)), t.index(max(t))
    return hips[lo], hips[hi], (max(t) - min(t)) / 2, ex, ey, cx, cy


def _use(fam, store):
    """图形按族只生成一次。"""
    if fam not in store:
        gy = FAMILY[fam]()
        parts = []
        if gy.get('vein'):
            parts.append(['vein', gy['vein']])
        if gy.get('eye'):
            parts.append(['eye', gy['eye']])
        store[fam] = {'d': gy['d'], 'parts': parts}
    return fam


def _place(hips, fam, order):
    if len(hips) == 1:
        return {'fam': fam, 'a': hips[0], 'k': 11.0}
    a, b, half, ex, ey, cx, cy = _axis(hips)
    # PCA 只给轴不给方向 —— 出来的斗柄可能是反的。用星官自己的连线顺序
    # 定向：古人画星官是从一头连到另一头的，那个顺序带着语义
    # （北斗从斗魁连到斗柄，蛇从头连到尾）。
    head, tail = order[0], order[-1]
    ph = proj(*SKY['stars'][str(head)][:2])
    pt = proj(*SKY['stars'][str(tail)][:2])
    if ((ph[0] - cx) * ex + (ph[1] - cy) * ey) > ((pt[0] - cx) * ex + (pt[1] - cy) * ey):
        a, b = b, a
    # 图形不铺满整个星官 —— 铺满会盖住星点和连线。上下限让 41 星的
    # 羽林军和 2 星的天门都还是「一个看得清的图形」。
    return {'fam': fam, 'a': a, 'b': b,
            'k': round(max(9.0, min(110.0, half * .95)), 1)}


# 分类器能吐出的族名必须都在 FAMILY 里 —— 少一个不会报错，只会让
# 那一批星官悄悄没有图形。这条断言就是为了不让它悄悄发生。
_used_fams = {family(g['name']) for g in SKY['cultures']['cn']['groups']}
_missing = sorted(_used_fams - set(FAMILY))
assert not _missing, f"这些族在 glyphs.FAMILY 里没有实现：{_missing}"

BESPOKE = set(FIG)                       # 已逐星作图的，不要被图标覆盖
GLYPHS = {}

for grp in SKY['cultures']['cn']['groups']:
    nm = grp['name']
    if nm in BESPOKE:
        continue
    hips = list(dict.fromkeys(h for ln in grp['lines'] for h in ln))
    FIG[nm] = _place(hips, _use(family(nm), GLYPHS),
                     [grp['lines'][0][0], grp['lines'][-1][-1]])

# 88 座西方星座全部备一份图标。85 座有插画，正常用不到；但投影会撕开
# 南天的星座（南极座那三颗散在外圈一整周），那时插画尺度失控必须丢弃，
# 丢了得有东西顶上。剩下 3 座本来就没画，这里正好补齐。
for grp in SKY['cultures']['iau']['groups']:
    nm = grp['name']
    if nm in BESPOKE:
        continue
    hips = list(dict.fromkeys(h for ln in grp['lines'] for h in ln))
    FIG[nm] = _place(hips, _use(iau_family(nm), GLYPHS),
                     [grp['lines'][0][0], grp['lines'][-1][-1]])


# ───────────────────────── 写出 ─────────────────────────
HEAD_DOC = (
    "/* 由 scripts/build_figures.py 生成 —— 不要手改，改了会被下次构建覆盖。\n"
    " *\n"
    " * 每个图形画在「作图坐标系」里：两颗锚星定义 A=(0,0)、B=(1,0)。渲染时\n"
    " * 按实测星位反推相似变换，所以图形永远咬在星上，换纬度换投影都不用重画。\n"
    " *\n"
    " * d      外廓，供辉光与底色\n"
    " * parts  细节，[类名, 路径]。羽/鳞/节共用 plume.py 的同一套笔法。\n"
    " * marks  自查：声明某颗星落在图上哪里，check_figures.py 拿真值对账。\n"
    " */\n")

body = ',\n'.join(
    '  ' + json.dumps(n, ensure_ascii=False) + ': ' + json.dumps(f, ensure_ascii=False)
    for n, f in FIG.items())
gbody = ',\n'.join(
    '  ' + json.dumps(k, ensure_ascii=False) + ': ' + json.dumps(v, ensure_ascii=False)
    for k, v in sorted(GLYPHS.items()))
OUT.write_text(HEAD_DOC
               + "export const GLYPHS = {\n" + gbody + ",\n};\n\n"
               + "export const FIGURES = {\n" + body + ",\n};\n",
               encoding='utf-8')

print(f"写出 {OUT.name}  {OUT.stat().st_size / 1024:.0f} KB")
print(f"  逐星作图 {len(BESPOKE)} 个：" + ' '.join(sorted(BESPOKE)))
print(f"  图形族 {len(GLYPHS)} 套，安放 {len(FIG) - len(BESPOKE)} 个星官")
cnt = {}
for n, f in FIG.items():
    if 'fam' in f:
        cnt[f['fam']] = cnt.get(f['fam'], 0) + 1
print('  ' + '  '.join(f"{k}:{v}" for k, v in sorted(cnt.items(), key=lambda kv: -kv[1])))
