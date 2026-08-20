"""由「中线 + 逐点宽度」生成锥形带状轮廓。

蝎尾、颈、四肢这类东西手写偏移量必歪 —— 每个点的法线方向都不同，
算错一个就鼓一个包。中线的点直接抄星位，宽度是唯一要凭手感给的量。
"""
import math


def catmull(pts, n=10):
    """Catmull-Rom 加密，端点各复制一次，保证过所有原始点。"""
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(len(P) - 3):
        p0, p1, p2, p3 = P[i:i + 4]
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                .5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
                      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in range(2)))
    out.append(tuple(pts[-1]))
    return out


def ribbon(pts, widths, n=4, tip=True, nd=3):
    """pts/widths 等长。返回闭合轮廓的 d 串。tip=True 时末端收成尖。"""
    assert len(pts) == len(widths)
    C = catmull(pts, n)
    # 宽度按弧长参数线性插值到加密后的点上
    seg = len(C) / (len(pts) - 1)
    W = []
    for i in range(len(C)):
        u = min(i / seg, len(widths) - 1.0001)
        k = int(u); f = u - k
        W.append(widths[k] * (1 - f) + widths[k + 1] * f)
    if tip:
        W[-1] = 0.0

    L, Rr = [], []
    for i, (x, y) in enumerate(C):
        a = C[max(0, i - 1)]; b = C[min(len(C) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        m = math.hypot(dx, dy) or 1e-9
        nx, ny = -dy / m, dx / m
        L.append((x + nx * W[i], y + ny * W[i]))
        Rr.append((x - nx * W[i], y - ny * W[i]))

    fm = lambda v: f"{round(v, nd):g}"
    d = 'M' + ' L'.join(f"{fm(x)} {fm(y)}" for x, y in L)
    d += ' L' + ' L'.join(f"{fm(x)} {fm(y)}" for x, y in reversed(Rr)) + ' Z'
    return d
