# The Supper Club

A menu lab for two calibrated AI models. Students and faculty ask **Levanto Sage** and **TypeSafe Jev** the same questions about 6,273 historic menus from NYPL's Buttolph Collection (1880–1920), and compare the probabilities each model returns.

Four rooms:

| Room | What it does |
| --- | --- |
| I. Head to Head | Pick a menu and up to 8 questions; both models read the scan; answers shown as probability bars with agree / split / Sage-declines badges, token cost and raw JSON. Jev's evidence boxes (Jev 1.14 `box` questions) are drawn on the scan; hover an answer to light its box, click to pin it. |
| II. Your Turn | Answer first with a confidence slider, then reveal both models (with evidence boxes). Log, running agreement scores, reflection, HTML / CSV / Copy export. Stays in localStorage. |
| III. By the Decade | Up to 6 questions across a stratified sample (12–60 menus) of 1880–1920, one call per model per menu. Three views of the same results: Where they split (one strip per question; each menu placed by the gap between the models, confident agreements collapsed into a count, rows with most splits first, "read these first" list), By decade (how many menus each model said yes to, e.g. "7 of 9", with a 90% Wilson range so small samples look small), and a fingerprint grid (menus × questions; cells read yes / no / "Sage yes · Jev no", scale cells as level pips). A model under 80% sure (50% for scales) is drawn as a ring or marked "?". CSV. |
| IV. The Kitchen | Write yes/no, choice or scale questions; see the exact request body for each API; saved questions appear in every room; import / export. |

No build step: `index.html`, `app.js`, `data/menus.json`.

## Run locally

```bash
python3 -I proxy/dev-proxy.py 8791
```

```bash
python3 -m http.server 8812
```

The dev proxy reads `SAGE_API_KEY` from the environment or from `~/.config/menu-lab/sage.env` (a line `SAGE_API_KEY=lv_live_...`). Never put the key in this folder. Jev goes through the existing Jev Sandbox Worker (`jev-sandbox-proxy.watkins-um.workers.dev`), which holds the TypeSafe key.

## Deploy

1. Proxy: from `proxy/`, run `npx wrangler secret put SAGE_API_KEY`, then `npx wrangler deploy`. It serves `POST /sage` (forwards to `sage.levanto.ai/decide/batch`) and `GET /img?id=&t=` (NYPL scans with CORS so the page can resize them). The page expects `https://menu-lab-proxy.watkins-um.workers.dev` when not on localhost; change `DEFAULTS.sage` in `app.js` or use the connection dialog (click the Sage pill).
2. Site: any static host (GitHub Pages works).

## How the two APIs are called

Both get the same JPEG (longest side 1400 px, inside Jev's 280–1568 px range) and the same context line.

- Sage: `/decide/batch` with `content: {kind: "image", media: "data:image/jpeg;base64,…", text}`; kinds `yesno` / `choice` / `scale`. Yes/no and choice can return `null` when too close to call; the site shows "Sage declines".
- Jev: SystemOne `/v1/systemone` with `assets: {"<menu>": {format: "jpg", data_base64}}`; types `noul` / `choice` / `score`. Always commits.

Normalization lives in `normSage` / `normJev` in `app.js`; agreement rules in `agreement` (same side of 50% for yes/no, same top option for choice, expected levels within 0.75 for scale).

## Data

`data/menus.json` is built by `tools/build_data.py` from The Pudding's menu-collection bundle (menu titles, places, years) and `menu-map.csv` (page image ids), both from [the-pudding/menu-story](https://github.com/the-pudding/menu-story) (MIT). Records are `[image_id, title, place, year, pudding_tags, more_page_ids]`. Scans load from `images.nypl.org` (`t=w` 760 px, `t=q` 1600 px; some scans lack `q`, the page falls back to `w`).

## Credits

By Marc Watkins. Built with Claude Code (Anthropic). Menus: NYPL Buttolph Collection. Catalogue: The Pudding (MIT). Palette: Sanzo Wada No. 290 via the [Combination Index](https://mwatkins03-netizen.github.io/Color-Index/#combo-290). Model answers are machine output and can be wrong.
