"""核对象形图的骨点：图里声明的星位，跟真实星位对不对得上。

画得好不好看要人眼判断；画得歪不歪不需要 —— 这里量。
只要 marks 抄错一位，图形就不再咬在星上，而屏幕上照样画得出东西，
没有这一步没人会发现。
"""
import json, subprocess, sys, pathlib, math
from figframe import frame, D

ROOT = pathlib.Path(__file__).resolve().parent
FIGS = json.loads(subprocess.run(
    ['node', str(ROOT / 'dump_figures.mjs')], capture_output=True, text=True,
    encoding='utf-8', cwd=ROOT).stdout)['FIGURES']

TOL = 0.008                     # 作图坐标系里的容差，A→B 距离为 1
bad = 0
for name, f in FIGS.items():
    if 'marks' not in f:          # 按族安放的没有骨点可对，本来就不逐星拟合
        continue
    cul = 'cn' if any(g['name'] == name for g in D['cultures']['cn']['groups']) else 'iau'
    _, real = frame(name, f['a'], f['b'], cul)
    print(f"{name}  锚 {f['a']}→{f['b']}  ({cul})")
    for hip, (mx, my) in f['marks'].items():
        rx, ry = real[int(hip)]
        d = math.hypot(mx - rx, my - ry)
        flag = '  ' if d <= TOL else '←偏'
        if d > TOL: bad += 1
        print(f"   HIP {hip:>6}  图({mx:6.3f},{my:7.3f})  实({rx:6.3f},{ry:7.3f})  差 {d:.4f} {flag}")

print(f"\n{'全部对齐' if not bad else f'{bad} 个骨点偏出容差 {TOL}'}")
sys.exit(1 if bad else 0)
