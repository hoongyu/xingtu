"""给页面里的资源引用打内容指纹，绕开浏览器缓存。

为什么要这一步：静态站点改完 engine.js / engine.css，浏览器不一定重新取 ——
它对没有缓存头的资源会用启发式缓存。开发时表现为「改了没生效」，
上线后表现为「用户看到的是上个版本」。两者是同一个问题。

指纹取文件内容的哈希，所以内容不变时 URL 不变，缓存照样命中。
每次改完 web/ 下的静态资源跑一次。
"""
import hashlib
import pathlib
import re
import sys

W = pathlib.Path(__file__).resolve().parents[1] / 'web'
ASSETS = ['engine.css', 'engine.js', 'sky.config.js', 'concept.config.js',
          'astro.css', 'astro.js', 'ephem.js', 'places.js',
          'wenkai-subset.woff2',
          'ziwei.css', 'ziwei.js', 'ziwei.page.js', 'ziwei.text.js',
          'card.js', 'birth.js',
          'lunar.js', 'gsap.esm.js']


def digest(name):
    # 先把换行归一到 LF 再算。指纹必须是「内容」的函数，
    # 不能是「在谁的磁盘上」的函数 —— Windows 检出会把 .js/.css 变成 CRLF，
    # 直接哈希原始字节的话，同一份内容在本机与 CI 上会算出两个指纹，
    # 永远对不上。归一后的值也正好等于 git 里存的那份的哈希。
    #
    # 这是 CI 加了「重跑生成器看 diff」的闸门之后第一次跑就抓出来的：
    # 本机 engine.css=366a97f1，CI 算的是 4b1f4d19，差的只是回车符。
    raw = (W / name).read_bytes().replace(b'\r\n', b'\n')
    return hashlib.sha1(raw).hexdigest()[:8]


def main():
    # og:image 多数抓取器只认绝对地址。定了域名之后跑：
    #   python scripts/stamp.py --base https://你的域名
    base = ''
    if '--base' in sys.argv:
        base = sys.argv[sys.argv.index('--base') + 1].rstrip('/') + '/'

    """模块内部的相对导入也要打戳。_headers 给 .js 设了一年不可变缓存，
    漏掉的那个会被永久缓存住 —— 而且没有任何报错，本地一切正常。

    上一版这里是一张手写的 (引用方, 被引用) 对照表。它漏了 engine.js
    那三条动态 import，于是 card.js 的引用长期挂在占位指纹 ?v=00000000：
    打开过这个站的人永远拿不到新版卡片。ephem.js / lunar.js 那两条当时
    手抄对了，纯属侥幸 —— 下一次改动照样静默过期。
    CI 那道闸门也抓不到，因为它比的是 stamp 跑完有没有 diff，
    而 stamp 压根不碰不在表里的那几行。

    所以不再手写。扫一遍所有带戳资源的正文，凡是引到另一个带戳资源的
    相对路径，一律改写。漏不掉，也不用记得维护。
    """
    def deps_of(name):
        if not name.endswith(('.js', '.css')):
            return set()
        t = (W / name).read_text(encoding='utf-8')
        # 只认引号里的相对路径 —— 放宽了会把注释里提到的文件名一起改掉。
        # .css 里是 url(...)，.js 里是 import 的字符串，两种都覆盖。
        got = set(re.findall(r"['\"(]\./([A-Za-z0-9_.-]+?)(?:\?v=[0-9a-f]+)?['\")]", t))
        return {d for d in got if d in ASSETS and d != name}

    DEPS = {a: deps_of(a) for a in ASSETS}

    # 顺序不能反：先改引用，再算被改文件的哈希。所以要按拓扑序，
    # 被依赖的先定下来。有环就直接断在这儿 —— 环意味着指纹无法收敛。
    order, seen, mark = [], set(), {}
    def visit(a, path):
        if a in seen:
            return
        if mark.get(a):
            raise SystemExit('资源之间有循环引用，指纹算不出来：'
                             + ' -> '.join(path + [a]))
        mark[a] = True
        for d in sorted(DEPS[a]):
            visit(d, path + [a])
        mark[a] = False
        seen.add(a); order.append(a)
    for a in ASSETS:
        visit(a, [])

    inner = 0
    for host in order:                       # 叶子在前，引用方在后
        if not DEPS[host]:
            continue
        hp = W / host
        t = t0 = hp.read_text(encoding='utf-8')
        for dep in sorted(DEPS[host]):
            t = re.sub(r"(['\"(])\./" + re.escape(dep) + r"(?:\?v=[0-9a-f]+)?(['\")])",
                       lambda m: f"{m.group(1)}./{dep}?v={digest(dep)}{m.group(2)}", t)
        if t != t0:
            hp.write_text(t, encoding='utf-8'); inner += 1
    print(f'  内部引用   扫了 {len(ASSETS)} 个资源，改写 {inner} 个文件')

    tags = {a: digest(a) for a in ASSETS}
    for page in ('index.html', 'concept.html', 'astro.html', 'ziwei.html'):
        p = W / page
        s = p.read_text(encoding='utf-8')
        for a, h in tags.items():
            # 已有戳就换掉，没有就加上
            s = re.sub(re.escape(a) + r'(\?v=[0-9a-f]+)?', f'{a}?v={h}', s)
        if base:
            s = re.sub(r'content="(?:https?://[^"]*/)?card\.png"',
                       f'content="{base}card.png"', s)
        p.write_text(s, encoding='utf-8')
    if base:
        print(f'  og:image -> {base}card.png')
    for a, h in tags.items():
        print(f'  {a:<20} {h}')
    print('\n  已戳进 index.html / concept.html / astro.html / ziwei.html')


if __name__ == '__main__':
    main()
