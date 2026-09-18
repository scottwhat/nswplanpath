import json,re,sys,urllib.parse
slug=sys.argv[1]; lga=sys.argv[2]
d=json.load(open(f'pdfs-{slug}.json'))
SUPERSEDED=re.compile(r'former|superseded|previous|archiv|draft|exhibit|repeal|proposed',re.I)
CATS=[('conditions', r'conditions?[- _]of[- _]consent|proforma[- _]condition|standard[- _]condition'),
      ('contributions',r'contribution|s7[-_. ]?1[12]|section[- _]?94|section[- _]?7\.1'),
      ('fees',       r'fees?[- _&]|charges|pricing'),
      ('flood',      r'flood'),  # narrowed by FLOOD_KEEP/FLOOD_DROP below
      ('strategy',   r'housing[- _]strateg|strategic[- _]planning[- _]statement|lsps'),
      ('dcp',        r'dcp|development[- _]control')]
SUB=r'(leichhardt|marrickville|ashfield|inner[- _]?west|local[- _]centres|north[- _]west[- _]growth|growth[- _]centre|bowral|mittagong|moss[- _]vale|bundanoon|robertson|hill[- _]top|rural|industrial|city[- _]centre)'
def clean(u):
    n=urllib.parse.unquote(u.split('/')[-1].split('?')[0])
    n=re.sub(r'\.pdf$','',n,flags=re.I)
    return (re.sub(r'[^A-Za-z0-9]+','-',n).strip('-').lower()[:110] or 'doc')
out=[];seen=set()
for x in d:
    u=x['url']
    full=urllib.parse.unquote(u).lower()
    tail=urllib.parse.unquote(u.split('/')[-1].split('?')[0]).lower()
    cat=next((c for c,p in CATS if re.search(p,full)),None)
    if not cat: continue
    if cat=='flood':
        FLOOD_DROP=r'study|annex|appendix|newsletter|terms[- _]of[- _]reference|committee|catchment|modelling|survey|minutes|agenda|report[- _]\d|volume'
        FLOOD_KEEP=r'polic|planning[- _]level|flood[- _]prone|control[- _]lot|development[- _]control|fpl|planning[- _]matrix|guideline|certificate'
        if re.search(FLOOD_DROP,tail) and not re.search(FLOOD_KEEP,tail): continue
    sup=bool(SUPERSEDED.search(tail)) or bool(re.search(r'/(draft|exhibition|archive|superseded|public-exhibitions)/',full))
    sub=''
    if cat=='dcp':
        m=re.search(SUB,tail)
        sub='/'+re.sub(r'[^a-z]+','-',m.group(1)) if m else '/general'
    name=clean(u)
    key=(cat,sub,name,sup)
    if key in seen: continue
    seen.add(key)
    folder=f"local/{slug}/_superseded/{cat}{sub}" if sup else f"local/{slug}/{cat}{sub}"
    itype={'dcp':'DCP','contributions':'CONTRIBUTIONS_PLAN','fees':'COUNCIL_POLICY',
           'flood':'COUNCIL_POLICY','conditions':'COUNCIL_POLICY','strategy':'COUNCIL_POLICY'}[cat]
    out.append({"doc_id":f"{slug}-{cat}-{name}"[:120],"title":(x['text'] or name)[:180],
                "instrument_type":itype,"tier":2,"lga":lga,"url":u,
                "path":f"{folder}/{name}.pdf","superseded":sup})
json.dump(out,open(f'list-{slug}.json','w'),indent=1)
cur=[o for o in out if not o['superseded']]
print(f"{slug}: {len(out)} selected ({len(cur)} current, {len(out)-len(cur)} superseded/draft)")
import collections
for k,v in collections.Counter('/'.join(o['path'].split('/')[2:-1]) for o in cur).most_common():
    print(f"   {v:4}  {k}")
