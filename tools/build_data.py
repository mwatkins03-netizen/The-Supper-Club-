#!/usr/bin/env python3
"""Build data/menus.json from The Pudding's menu-collection bundle and menu-map.csv (both MIT, the-pudding/menu-story).
Usage: python3 -I tools/build_data.py <bundle.js> <menu-map.csv> <out.json>
The bundle is every _app/immutable/*.js file of pudding.cool/2026/06/menu-collection/ concatenated.
Records: [image_id, title, place, year, pudding_tags, [page image ids]]. Kept: years 1880-1920.
"""
import csv, json, re, sys, urllib.parse as u
from collections import defaultdict

bundle, mapcsv, out = sys.argv[1:4]
s = open(bundle, encoding="utf-8").read()
pat = re.compile(r'\{filename:"(\d+)\.jpg",restaurant_title:"([^"]*)",geography_city:"([^"]*)",state:"([^"]*)",year:"(\d*)",menuType:"[^"]*",rest:"([^"]*)",tags:"([^"]*)",squirrel:"([^"]*)",rare:"([^"]*)",turtle:"([^"]*)",birdie:"([^"]*)"\}')

by_menu = defaultdict(list); img_menu = {}
for r in csv.DictReader(open(mapcsv)):
    by_menu[r["menu_id"]].append((int(r["page_number"] or 0), r["image_id"]))
    img_menu[r["image_id"]] = r["menu_id"]

seen, rows = set(), []
for m in pat.finditer(s):
    img, title, city, state, year, rest, tags, *flags = m.groups()
    if img in seen or not year.isdigit() or not 1880 <= int(year) <= 1920: continue
    seen.add(img)
    place = u.unquote(city).strip()
    t = [x for x in [rest] + flags + [tags] if x]
    pages = [i for _, i in sorted(by_menu.get(img_menu.get(img, ""), []))]
    if pages and img in pages: pages.remove(img); pages.insert(0, img)
    rows.append([int(img), " ".join(u.unquote(title).split()), place, int(year), t, [int(p) for p in pages[1:12] if p.isdigit()]])

rows.sort(key=lambda r: (r[3], r[1]))
json.dump({"source": "The Pudding, menu-collection (MIT) + NYPL Buttolph Collection", "fields": ["image", "title", "place", "year", "tags", "more_pages"], "menus": rows},
          open(out, "w"), separators=(",", ":"), ensure_ascii=False)
print(len(rows), "menus;", sum(1 for r in rows if r[5]), "with more pages")
