"""把 Stellarium 星官 + NADC 坐标联成网页能直接吃的一份 JSON。

输出只含渲染真正用得到的字段，因为它要整个塞进浏览器。
坐标一律留 J2000 赤经赤纬，投影在前端做 —— 换投影不必重跑管线。
"""

import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "source"
OUT = ROOT / "web" / "skydata.json"

CULTURES = [
    ("cn", "stellarium_chinese.json", "中国星官"),
    ("iau", "stellarium_modern_iau.json", "西方星座"),
]


def load_art():
    """IAU 缩写 -> 插画（文件名、画幅、三颗锚星的像素坐标）。

    锚点是 Stellarium 自带的：三对「像素 ↔ 星位」定一个仿射变换，
    图就落在真实星位上。前端照这个算，不必自己配准。
    """
    doc = json.loads((SRC / "art_index.json").read_text(encoding="utf-8"))
    out = {}
    for c in doc["constellations"]:
        img = c.get("image")
        if not img or "iau" not in c:
            continue
        # 上游把南三角座写成 "Tra"，IAU 标准是 "TrA"。大小写不一致会让
        # 那一张图静默配不上 —— 少一张图不报错，只是永远不出现。
        out[c["iau"].lower()] = {
            "f": img["file"].split("/")[-1],
            "wh": img["size"],
            "an": [[a["pos"][0], a["pos"][1], a["hip"]] for a in img["anchors"]],
        }
    # 上游只把图挂在其中一座上，但有几幅画本来就跨座：
    #   argonavis.webp 是整条南船，古船分家前船底/船尾/船帆是一个星座；
    #   ophiuchus.webp 里蛇夫本来就抱着那条蛇，巨蛇座在画里。
    # 共用同一份锚点即可 —— 锚点是绝对星位，画会落在同一个地方。
    for src, dsts in (("car", ("pup", "vel")), ("oph", ("ser",))):
        if src in out:
            for d in dsts:
                out.setdefault(d, out[src])
    return out


def load_stars():
    """HIP -> (ra, dec, vmag)。NADC 是 CC BY 4.0，无传染性，所以坐标全走它。"""
    stars = {}
    with open(SRC / "nadc_caafrc.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                stars[int(r["HIP"])] = (
                    float(r["RA"]), float(r["Dec"]),
                    float(r["Vmag"]) if r["Vmag"].strip() else 99.0,
                )
            except ValueError:
                continue
    return stars


# 88 星座的中文名与拉丁学名。Stellarium 的 english 字段给的是**意译**
# （Antlia -> "Air Pump"），对中文读者既不是通名也不是学名，不能直接用。
# 键是 IAU 三字母缩写，从 con["id"] 尾部取。
IAU_ZH = {
    "And": ("仙女座", "Andromeda"), "Ant": ("唧筒座", "Antlia"),
    "Aps": ("天燕座", "Apus"), "Aqr": ("宝瓶座", "Aquarius"),
    "Aql": ("天鹰座", "Aquila"), "Ara": ("天坛座", "Ara"),
    "Ari": ("白羊座", "Aries"), "Aur": ("御夫座", "Auriga"),
    "Boo": ("牧夫座", "Bootes"), "Cae": ("雕具座", "Caelum"),
    "Cam": ("鹿豹座", "Camelopardalis"), "Cnc": ("巨蟹座", "Cancer"),
    "CVn": ("猎犬座", "Canes Venatici"), "CMa": ("大犬座", "Canis Major"),
    "CMi": ("小犬座", "Canis Minor"), "Cap": ("摩羯座", "Capricornus"),
    "Car": ("船底座", "Carina"), "Cas": ("仙后座", "Cassiopeia"),
    "Cen": ("半人马座", "Centaurus"), "Cep": ("仙王座", "Cepheus"),
    "Cet": ("鲸鱼座", "Cetus"), "Cha": ("蝘蜓座", "Chamaeleon"),
    "Cir": ("圆规座", "Circinus"), "Col": ("天鸽座", "Columba"),
    "Com": ("后发座", "Coma Berenices"), "CrA": ("南冕座", "Corona Australis"),
    "CrB": ("北冕座", "Corona Borealis"), "Crv": ("乌鸦座", "Corvus"),
    "Crt": ("巨爵座", "Crater"), "Cru": ("南十字座", "Crux"),
    "Cyg": ("天鹅座", "Cygnus"), "Del": ("海豚座", "Delphinus"),
    "Dor": ("剑鱼座", "Dorado"), "Dra": ("天龙座", "Draco"),
    "Equ": ("小马座", "Equuleus"), "Eri": ("波江座", "Eridanus"),
    "For": ("天炉座", "Fornax"), "Gem": ("双子座", "Gemini"),
    "Gru": ("天鹤座", "Grus"), "Her": ("武仙座", "Hercules"),
    "Hor": ("时钟座", "Horologium"), "Hya": ("长蛇座", "Hydra"),
    "Hyi": ("水蛇座", "Hydrus"), "Ind": ("印第安座", "Indus"),
    "Lac": ("蝎虎座", "Lacerta"), "Leo": ("狮子座", "Leo"),
    "LMi": ("小狮座", "Leo Minor"), "Lep": ("天兔座", "Lepus"),
    "Lib": ("天秤座", "Libra"), "Lup": ("豺狼座", "Lupus"),
    "Lyn": ("天猫座", "Lynx"), "Lyr": ("天琴座", "Lyra"),
    "Men": ("山案座", "Mensa"), "Mic": ("显微镜座", "Microscopium"),
    "Mon": ("麒麟座", "Monoceros"), "Mus": ("苍蝇座", "Musca"),
    "Nor": ("矩尺座", "Norma"), "Oct": ("南极座", "Octans"),
    "Oph": ("蛇夫座", "Ophiuchus"), "Ori": ("猎户座", "Orion"),
    "Pav": ("孔雀座", "Pavo"), "Peg": ("飞马座", "Pegasus"),
    "Per": ("英仙座", "Perseus"), "Phe": ("凤凰座", "Phoenix"),
    "Pic": ("绘架座", "Pictor"), "Psc": ("双鱼座", "Pisces"),
    "PsA": ("南鱼座", "Piscis Austrinus"), "Pup": ("船尾座", "Puppis"),
    "Pyx": ("罗盘座", "Pyxis"), "Ret": ("网罟座", "Reticulum"),
    "Sge": ("天箭座", "Sagitta"), "Sgr": ("人马座", "Sagittarius"),
    "Sco": ("天蝎座", "Scorpius"), "Scl": ("玉夫座", "Sculptor"),
    "Sct": ("盾牌座", "Scutum"), "Ser": ("巨蛇座", "Serpens"),
    "Sex": ("六分仪座", "Sextans"), "Tau": ("金牛座", "Taurus"),
    "Tel": ("望远镜座", "Telescopium"), "Tri": ("三角座", "Triangulum"),
    "TrA": ("南三角座", "Triangulum Australe"), "Tuc": ("杜鹃座", "Tucana"),
    "UMa": ("大熊座", "Ursa Major"), "UMi": ("小熊座", "Ursa Minor"),
    "Vel": ("船帆座", "Vela"), "Vir": ("室女座", "Virgo"),
    "Vol": ("飞鱼座", "Volans"), "Vul": ("狐狸座", "Vulpecula"),
}

def iau_abbr(con):
    """从 con["id"] 取 IAU 三字母缩写。原始 id 是 "CON modern_iau And" —— 空格分隔，
    不是下划线。曾按下划线切，88 个全部取到 "iau And"，一个都没命中，
    而 dict.get 的默认值让它悄悄退回英文意译，没有任何报错。
    """
    return con["id"].split()[-1]


def name_of(con, key):
    cn = con.get("common_name", {}) or {}
    if key == "cn":
        return cn.get("native") or cn.get("english") or con["id"]
    zh, _ = IAU_ZH.get(iau_abbr(con), (None, None))
    return zh or cn.get("english") or con["id"]


def build():
    stars = load_stars()
    art = load_art()
    used = set()
    cultures = {}

    # 锚星未必落在任何连线上 —— 天鹅座的三颗锚星之一是「臼一」，根本不属于
    # 天鹅座。漏掉它，前端解不出仿射变换，整幅图会错位，而且不会报错。
    art_hips = {a[2] for v in art.values() for a in v["an"]}
    lost = sorted(h for h in art_hips if h not in stars)
    assert not lost, f"这些锚星在 NADC 星表里查不到坐标，插画会错位：{lost}"
    used |= art_hips

    for key, fn, label in CULTURES:
        doc = json.loads((SRC / fn).read_text(encoding="utf-8"))
        groups = []
        for con in doc["constellations"]:
            lines = [ln for ln in con.get("lines", []) if len(ln) > 1]
            hips = {h for ln in lines for h in ln}
            if not hips:
                continue
            # 只保留坐标查得到的星，否则前端会画出断线
            known = {h for h in hips if h in stars}
            if not known:
                continue
            lines = [[h for h in ln if h in stars] for ln in lines]
            lines = [ln for ln in lines if len(ln) > 1]
            if not lines:
                continue
            used |= {h for ln in lines for h in ln}
            cn = con.get("common_name", {}) or {}
            entry_art = art.get(con["id"].split()[-1].lower()) if key == "iau" else None
            groups.append({
                "art": entry_art,
                "id": con["id"].replace(" ", "_"),
                "name": name_of(con, key),
                "en": IAU_ZH.get(iau_abbr(con), ("", cn.get("english", "")))[1],
                "py": cn.get("pronounce", ""),
                "lines": lines,
            })
        if key == "iau":
            miss = [g["id"] for g in groups if not any("一" <= c <= "鿿" for c in g["name"])]
            assert not miss, f"这些星座没拿到中文名，查 IAU_ZH 的键：{miss}"
        cultures[key] = {"label": label, "groups": groups}

    # 汉字星名：主仓库的 common_names 每条都带汉字
    zh_names = {}
    doc = json.loads((SRC / "stellarium_chinese.json").read_text(encoding="utf-8"))
    for k, v in (doc.get("common_names") or {}).items():
        if not k.startswith("HIP "):
            continue
        hip = int(k[4:])
        if hip not in used:
            continue
        first = v[0] if isinstance(v, list) else v
        if isinstance(first, dict):
            first = first.get("native") or first.get("english")
        if first:
            zh_names[hip] = str(first)

    # 28 宿距星：辐射状分界线从这些星拉出去，数据里直接给了
    lunar = doc.get("lunar_system", {}).get("defining_stars", [])

    star_rows = {}
    for h in sorted(used):
        ra, dec, mag = stars[h]
        star_rows[h] = [round(ra, 4), round(dec, 4), round(mag, 2)]

    # 讲解从数据走，不再硬编在页面里 —— 换一份数据集就得改代码是不对的，
    # 概念星图那边逼出了这个结论。
    from lore import LORE as lore
    from starnotes import STAR_NOTES

    # 单颗星的天文事实，按中文星名挂到 HIP 上。名字写错就挂不上，
    # 所以出口处要断言 —— 挂不上不会报错，只是永远不出现。
    note_by_hip = {}
    unmatched = set(STAR_NOTES)
    for hip, nm in zh_names.items():
        if nm in STAR_NOTES:
            note_by_hip[hip] = STAR_NOTES[nm]
            unmatched.discard(nm)
    known = {g["name"] for c in cultures.values() for g in c["groups"]}
    stray = sorted(set(lore) - known)
    assert not stray, f"这些讲解对不上任何星官/星座（多半是名字写错）：{stray}"

    assert not unmatched, f"这些星名在星表里查不到，注解会静默丢失：{sorted(unmatched)}"

    payload = {
        "lore": lore,
        "notes": note_by_hip,
        "meta": {
            "stars": len(star_rows),
            "note": "坐标 J2000，来自 NADC CAAFRC (CC BY 4.0, DOI 10.12149/100877)；"
                    "星官与连线来自 Stellarium (CC BY-SA 4.0)",
        },
        "stars": star_rows,
        "names": zh_names,
        "lunar_mansions": [h for h in lunar if h in star_rows],
        "cultures": cultures,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")

    print(f"  星 {len(star_rows)} 颗   汉字星名 {len(zh_names)} 个   "
          f"28宿距星 {len(payload['lunar_mansions'])}   单星注解 {len(note_by_hip)} 条")
    for key, c in cultures.items():
        withart = sum(1 for g in c["groups"] if g.get("art"))
        if withart:
            print(f"  插画覆盖 {withart}/{len(c['groups'])}  缺："
                  + " ".join(g["name"] for g in c["groups"] if not g.get("art")))
        segs = sum(len(g["lines"]) for g in c["groups"])
        print(f"  {c['label']:<8} {len(c['groups']):>3} 组   {segs:>4} 段折线")
    print(f"\n  -> {OUT.relative_to(ROOT)}  {OUT.stat().st_size/1024:.0f} KB")


if __name__ == "__main__":
    build()
