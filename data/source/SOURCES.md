# 数据来源与授权

上游 commit 锁定：`7c713e99f4e8fb5d798817662fd671e66fcedf5f`（2026-06-22）
**不在构建期实时拉取。** 两个 Stellarium 仓库随时可能再合并或再拆分。

| 文件 | 来源 | 授权 | 商用 |
|---|---|---|---|
| `stellarium_chinese.json` | Stellarium 主仓库 `skycultures/chinese/` | CC BY-SA 4.0 | ✅ 需署名 + 相同方式共享 |
| `stellarium_chinese_{chenzhuo,song_dynasty,yuan_dynasty}.json` | 同上，断代体系 | CC BY-SA 4.0 | ✅ |
| `stellarium_modern_iau.json` | 同上 `skycultures/modern_iau/` | CC BY-SA 4.0 | ✅ |
| `nadc_caafrc.csv` | 国家天文科学数据中心《中国古天文基础参考星表》 DOI 10.12149/100877 | **CC BY 4.0** | ✅ 仅需署名，**无传染性** |

## ⛔ 已排除，不要再下

- **`greek_almagest`** —— CC BY-ND 4.0，**禁止改作**。渲染即改作。虽然数据更丰富（49 星座 / 855 连线星），但不能用。
- **Yale BSC5** —— 整份文档零授权声明。
- **Hipparcos/Tycho-2 从 ESA 直取** —— CC BY-NC 3.0 IGO，商用须申请。

## 署名要求

发布时必须署名：
- Stellarium 星空文化数据（CC BY-SA 4.0），贡献者 Karrie Berglund、孙述伟，依伊世同《中西对照恒星图表 1950.0》
- 国家天文科学数据中心《中国古天文基础参考星表》，DOI 10.12149/100877（CC BY 4.0）
