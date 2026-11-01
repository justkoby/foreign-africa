# Compares two capture directories pixel by pixel and by DOM. Usage: python3 compare.py <baselineDir> <newDir>
import sys,glob,os
from PIL import Image,ImageChops
a,b=sys.argv[1:3]
worst=0;bad=[];n=0
for f in sorted(glob.glob(a+'/*.png')):
    g=os.path.join(b,os.path.basename(f))
    if not os.path.exists(g): bad.append((os.path.basename(f),'missing'));continue
    x=Image.open(f).convert('RGB');y=Image.open(g).convert('RGB')
    if x.size!=y.size: bad.append((os.path.basename(f),f'size {x.size} vs {y.size}'));continue
    d=ImageChops.difference(x,y);bbox=d.getbbox();n+=1
    if bbox:
        px=sum(1 for p in d.get_flattened_data() if max(p)>8) if hasattr(d,'get_flattened_data') else sum(1 for p in d.getdata() if max(p)>8)
        worst=max(worst,px)
        if px>0: bad.append((os.path.basename(f),f'{px} px differ, box {bbox}'))
dom=[]
for f in sorted(glob.glob(a+'/*-dom.html')):
    g=os.path.join(b,os.path.basename(f))
    dom.append((os.path.basename(f), open(f).read()==open(g).read()))
print(f'compared {n} screenshots; differing: {len(bad)}; worst={worst}px')
for x in bad: print('  ',x)
print('DOM identical:',dom)
