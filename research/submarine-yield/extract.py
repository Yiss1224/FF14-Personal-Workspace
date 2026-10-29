"""Build yield-data.json from Infiziert90 sources (MIT).

Usage: python3 -I extract.py <Submarines.json> <SubmarineTracker Sectors.cs> <SubmarinePart.csv> <out.json>
"""
import csv, json, re, sys

subs, sectors_cs, part_csv, out = sys.argv[1:5]
src = json.load(open(subs, encoding='utf-8'))['Sectors']
bp = {int(m[0]): list(map(int, m[1:])) for m in
      re.findall(r'\{\s*(\d+),\s*new Breakpoint\((\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)', open(sectors_cs, encoding='utf-8-sig').read())}

sectors = {}
for sid, s in src.items():
    pools = {}
    for tier, p in s['Pools'].items():
        st = p['Stats']
        pools[tier[-1]] = {
            'records': p['Records'],
            # Surveillance class at drop time: Min (<T2), Mid (T2..T3), High (>=T3).
            'surv': [st['Min'], st['Mid'], st['High']],
            # Retrieval class: Low (poor), Normal, Optimal.
            'ret': [st['Low'], st['Normal'], st['Optimal']],
            'favor': st['Favor'], 'doubleDips': st['DoubleDips'],
            'items': [[r['Id'], r['Amount'], r['MinMax']['Poor'], r['MinMax']['Normal'], r['MinMax']['Optimal']]
                      for r in p['Rewards'].values()],
        }
    sectors[sid] = {'records': s['Records'], 't3Capable': s['T3Capable'],
                    'breakpoints': bp.get(int(sid)), 'pools': pools}

# SubmarinePart: map the sheet's Class column to this site's build digits.
# 1 鯊 2 雲鯨 3 鯨 4 腔棘魚 5 希爾德里昂, 6–10 = the same order, modified (改).
cls = {3: 1, 2: 2, 1: 3, 4: 4, 5: 5, 8: 6, 7: 7, 6: 8, 9: 9, 10: 10}
parts = {}
for row in csv.DictReader(open(part_csv, encoding='utf-8-sig')):
    if row['#'] == '0':
        continue
    c = cls[int(row['Class'])]
    parts.setdefault(c, [None] * 4)[int(row['Slot'])] = [int(row[k]) for k in
        ('Rank', 'Components', 'Surveillance', 'Retrieval', 'Speed', 'Range', 'Favor')]

json.dump({'attribution': 'Loot pools: Infiziert90/FFXIVGachaSpreadsheet Submarines.json; breakpoints: '
           'Infiziert90/SubmarineTracker Data/Sectors.cs (community data); parts: SubmarinePart sheet '
           '(xivapi/ffxiv-datamining). Part rows: [rank, capacity, surveillance, retrieval, speed, range, favor].',
           'parts': parts, 'sectors': sectors}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
