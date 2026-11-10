# Counts each encounter map's encounter tiles from its terrain (regions.md, Tiles). Run from the repository:
#   python3 docs/paperwhite2/ecological-encounters/tools/tiles.py docs/paperwhite2/ecological-encounters/tiles.json
import json,glob,os,collections,csv,sys
R='res/field'
Z={os.path.basename(f)[:-5]:json.load(open(f)) for f in glob.glob(R+'/zones/*.json')}
WATER,ENC=0x2,0x4
GRASS={0x04,0x05,0x08,0x21}; DGRASS={0x06,0x07,0x09}; BRIDGE=0x20
def terrain(model):
    d=f"{R}/maps/models/{model.removeprefix('MAP_MODEL_').lower()}"
    c=collections.Counter()
    for f in glob.glob(d+'/terrain_*.csv'):
        if 'splits' in f: continue
        for row in csv.DictReader(open(f)):
            t=int(row['tile_type'])
            if t==0xffffffff: continue
            cls,fl=t&0xffff,t>>16
            if fl&ENC:
                if fl&WATER: c['surf']+=1
                elif cls in DGRASS: c['dark_grass']+=1
                elif cls in GRASS: c['grass']+=1
                else: c[f'walk_cls{cls:#x}']+=1
            elif fl&WATER: c['water_noenc']+=1
            if cls==BRIDGE: c['bridge']+=1
    return c
cells=collections.defaultdict(list)  # zone -> models
for mf in glob.glob(R+'/matrices/*.json'):
    m=json.load(open(mf)); name=os.path.basename(mf)[:-5]
    if 'maps' not in m: continue
    maps=m['maps']
    if isinstance(maps,str): maps=eval(maps)
    zg=m.get('zones')
    owners=[z for z,d in Z.items() if d.get('matrix')=='MAP_MATRIX_'+name.upper()]
    for r,row in enumerate(maps):
        for x,model in enumerate(row):
            if not model: continue
            zone=zg[r][x] if zg else None
            if zone: cells[zone.removeprefix('ZONE_').lower()].append(model)
            elif not zg and len(owners)==1: cells[owners[0]].append(model)
            elif not zg: 
                for o in owners: cells[o].append(model)
            else: cells['(unassigned overworld)'].append(model)
out={}
for z,d in sorted(Z.items()):
    e=d.get('encounters')
    if not isinstance(e,str) or not e.startswith('ENCOUNTERS_'): continue
    c=collections.Counter()
    for model in cells.get(z,[]): c+=terrain(model)
    out[e.removeprefix('ENCOUNTERS_').lower()]={'zone':z,'models':len(cells.get(z,[])),'tiles':dict(c)}
json.dump(out,open(sys.argv[1],'w'),indent=1)
for a,v in out.items(): print(a, v['models'], v['tiles'])
