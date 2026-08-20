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
          'astro.css', 'astro.js', 'ephem.js']


def digest(name):
    return hashlib.sha1((W / name).read_bytes()).hexdigest()[:8]


def main():
    # og:image 多数抓取器只认绝对地址。定了域名之后跑：
    #   python scripts/stamp.py --base https://你的域名
    base = ''
    if '--base' in sys.argv:
        base = sys.argv[sys.argv.index('--base') + 1].rstrip('/') + '/'

    # 模块内部的相对导入也要打戳。_headers 给 .js 设了一年不可变缓存，
    # 漏掉的那个会被永久缓存住 —— 顺序不能反：先改引用，再算被改文件的哈希。
    INNER = [('astro.js', 'ephem.js')]
    for host, dep in INNER:
        hp = W / host
        t = hp.read_text(encoding='utf-8')
        # 只改引号里的相对导入路径 —— 放宽了会把注释里提到的文件名一起改掉
        t2 = re.sub(r"'\./" + re.escape(dep) + r"(\?v=[0-9a-f]+)?'",
                    f"'./{dep}?v={digest(dep)}'", t)
        if t2 != t:
            hp.write_text(t2, encoding='utf-8')

    tags = {a: digest(a) for a in ASSETS}
    for page in ('index.html', 'concept.html', 'astro.html'):
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
    print(f'\n  已戳进 index.html / concept.html')


if __name__ == '__main__':
    main()
