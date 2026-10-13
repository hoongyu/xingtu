**English** | [简体中文](README.zh-CN.md)

# Xingtu star map engine

An exploratory rendering engine for "points + polylines + groups", plus two datasets that put it to work. The interface is in Chinese.

Live: <https://hoongyu.github.io/xingtu/> (GitHub Pages, deployed automatically on every push to `main`)

> After a push you **may still see the old version for up to ten minutes**. GitHub Pages serves HTML with
> `Cache-Control: max-age=600` and ignores `_headers`, so this cannot be changed. Asset fingerprints prevent
> "my change did not take effect", but they cannot prevent "the HTML itself is cached": the old HTML faithfully
> fetches the assets with the old fingerprints, so you get a consistent old version that works, just old.
> To check right away, add a query string such as `?v=2` to the URL.

- **Star map**: 308 Chinese asterisms (xingguan) and 88 Western constellations, two ways of grouping the same stars
- **Concept map**: "artificial intelligence" broken into 161 keywords, two ways of grouping the same words
- **Astrolabe**: planet positions are actually computed; the Western chart uses the twelve zodiac signs, the Chinese chart the twenty-eight lunar mansions along the equator, two coordinate systems for the same planets

The first two share `engine.js`. The astrolabe stands on its own: rings and sectors are a different kind of graphic, and forcing them into the engine would be worse than writing them separately. That is where the engine's boundary lies.

Both datasets use the same `engine.js`; all the differences live in their configuration files.

```
web/
  engine.js            rendering engine (knows nothing about astronomy or AI)
  engine.css           styles
  sky.config.js        star map configuration
  concept.config.js    concept map configuration
  index.html           star map        <- one line: mount(CFG)
  concept.html         concept map     <- one line: mount(CFG)
  astro.html           astrolabe (separate: the chart is rings + sectors and does not go through the engine)
  ephem.js             ephemeris: planet positions
  astro.js             chart casting and readings
  skydata.json         167 KB
  conceptdata.json      33 KB
  art/                 85 constellation illustrations + CREDITS.md (Free Art License, please read)
scripts/
  build_skydata.py     star catalogue + asterism lines + illustration anchors -> skydata.json
  build_concept.py     concept table + two groupings + polar layout -> conceptdata.json
  lore.py / lore_more.py   396 notes on the origins of asterisms and constellations (merged into skydata.json at build time)
  starnotes.py         52 astronomical facts about individual stars
  build_astro.py       astrolabe entries and lunar mansion boundaries -> astrodata.json
  build_card.py        social preview image card.png
  stamp.py             content fingerprints for static assets, to get around browser caching
  preview_*.py         render standalone SVGs for visual checks (when the browser cannot take a screenshot)
  parked/              a retired hand-drawn pictogram toolchain, with the reason it was retired
data/
  source/              copies of upstream data, commit pinned in ART_COMMIT.txt
```

## What the engine understands

The shape of the data:

```jsonc
{
  "stars":  { "<id>": [x, y, ...any fields] },   // the first two are the position, the rest are interpreted by the config
  "names":  { "<id>": "display name" },
  "lore":   { "<group name>": "explanation" },   // source in scripts/lore.py, merged at build time
  "cultures": {
    "<grouping key>": { "label": "grouping name", "groups": [
      { "name": "group name", "lines": [["<id>", "<id>", ...]], "art": {...} }
    ]}
  }
}
```

**The engine does not do layout.** It only knows that "a point has `[x, y]`". The star map's coordinates come from an azimuthal equidistant projection around the north pole; the concept map's come from a polar arrangement (radius = level of abstraction, angle = domain sector). In both cases the caller computes them and passes them in. Once the engine handles layout itself, it becomes yet another graph layout library, and layout quality is a research problem, not a product problem.

What a configuration provides (easiest to see by comparing `sky.config.js` and `concept.config.js`):

| Hook | Star map | Concept map |
|---|---|---|
| `project(a,b)` | projection maths | returns `[a,b]` as is |
| `pointSet` | `byCulture` (the two cultures use different stars to begin with) | `all` (same points, two groupings) |
| `radius(f)` / `dim(f)` | magnitude | importance |
| `visible(f, tier)` | declination vs observer latitude | difficulty vs difficulty tier |
| `tiers` | six cities | beginner / intermediate / research / all |
| `rings(D, tier)` | circumpolar circle / equator / outer limit | four rings of abstraction |
| `tipRows` / `facts` | magnitude, right ascension, declination | level, domain, difficulty |
| `artUsable` | whether a constellation is torn apart by the projection | not provided (no illustrations) |
| `rail` / `text` | thirteen zodiac constellations, twenty-eight mansions... | pipeline, technology lineage... |

This table was not designed up front. The method was to **copy the page and hard-code it for a second dataset** first. At that point the two pages shared 87% of their lines and differed in 38 places, and those 38 places are the hooks above. With only one dataset, any interface you extract is bound to be wrong: it mistakes accidents of the star map for its essence.

## Run

```bash
python scripts/build_skydata.py      # -> web/skydata.json
python scripts/build_concept.py      # -> web/conceptdata.json
python -m http.server 8777 --directory web
```

`/` is the star map and `/concept.html` is the concept map.

## Data sources and licences

| | Source | Licence |
|---|---|---|
| Star coordinates | NADC Ancient Chinese Astronomy Basic Reference Star Catalogue (DOI 10.12149/100877) | CC BY 4.0 |
| Asterisms and lines | Stellarium sky cultures | CC BY-SA 4.0 |
| 85 constellation illustrations | Johan Meuris / Stellarium | **Free Art License 1.3** |
| Concept data and explanations | this project | — |

The illustrations come with an **engineering constraint**: under Article 4 of the Free Art License, if the work cannot be taken out of the finished product on its own, the whole product must adopt that licence. So the images under `web/art/` **must be published as separate files**: do not inline them as data URIs, do not bundle them into JS, and do not merge them into sprites. See `web/art/CREDITS.md`.

## Where the astrolabe page stands

**Planet positions are actually computed**, using JPL's approximate planetary orbital elements and Meeus's series for the Sun and Moon, valid for 1800 to 2050. They were checked against three total solar eclipses and two total lunar eclipses: at the solar eclipses the Sun and Moon differ in ecliptic longitude by 0.04 to 0.06 degrees, at the lunar eclipses by 179.96 to 180.00 degrees.

**How to read those positions is a matter of tradition.** Astrology is a cultural system more than two thousand years old, but it is not a predictive science. The page labels the two separately, and its entries say "traditionally held to".

Birth date, time and place are all computed in the browser and never uploaded. Places come from a built-in city table, with no third-party geocoding, because that is personal data.
