# 星座插画来源与授权

本目录下的 85 个 `.webp` 文件是**星座象形插画**，不是本项目的原创作品。

## 作者

**Johan Meuris** — 为 Stellarium 绘制的 88 幅西方星座插画。
作者页：<https://johanmeuris.eu/work/stellarium-constellation-art/>

## 原件出处

Stellarium 官方 sky culture 仓库，`chinese_contemporary/illustrations/`：

<https://github.com/Stellarium/stellarium-skycultures>

本项目取用的上游提交锁定在 `data/source/ART_COMMIT.txt`，
配套的锚点数据（每幅图三颗基准星的像素坐标）取自同一提交的
`chinese_contemporary/index.json`，副本存于 `data/source/art_index.json`。

## 授权

**Free Art License 1.3**（Licence Art Libre）
全文：<https://artlibre.org/licence/lal/en/>

允许复制、传播、修改，**允许商业使用**。义务有三条：

1. **随附许可证**，或指明何处可以取得（本文件即为此用）。
2. **署名原作者**；若有修改，一并署上修改者。
3. **告知取得原件的途径**（上面的仓库地址）。

再加一条对衍生作品的要求：

4. 修改后的作品**必须以同一许可证或兼容许可证发布**。

## 一条工程约束，不要绕过

Free Art License **第 4 条**：插画若在成品中**无法被单独取用**，
则整个成品必须一并采用本许可证或兼容许可证。

**所以这些图必须作为独立文件发布** —— 不要内联成 data URI、
不要打进 JS bundle、不要拼成雪碧图。保持文件独立，
本项目的代码就不受 FAL 传染（Stellarium 自己也是 GPL 代码 + FAL 插画共存）。

改动构建流程前先读这一段。

## 本项目自绘的部分

本项目曾自绘过一套中国星官象形，2026-08-19 下架（见
`scripts/parked/README.md`）。船尾座、船帆座、巨蛇座现在共用上游已有的
`argonavis.webp` / `ophiuchus.webp` —— 古船分家前是一个星座，
蛇夫的画本来就抱着那条蛇。所以本目录之外没有别的插画来源。
