"""Import an archived WP posts response into safe, local article trees.

Usage: python scripts/import-commentaries.py /path/to/wp-posts.json
Only editorial tags/attributes survive; no HTML is injected by the reader.
"""
import concurrent.futures, hashlib, io, json, sys, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = set('p h2 h3 h4 h5 h6 strong em b i a img br hr figure figcaption blockquote ul ol li sup sub table thead tbody tr td th'.split())
VOID = {'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr'}
DROP = {'script', 'style', 'iframe', 'form', 'button', 'input', 'noscript'}

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag':'root','children':[]}
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        node = {'tag':tag,'attrs':dict(attrs),'children':[]}
        self.stack[-1]['children'].append(node)
        if tag not in VOID: self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID: self.handle_endtag(tag)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i]['tag']==tag:
                del self.stack[i:]
                break
    def handle_data(self, text): self.stack[-1]['children'].append(text)

def plain(node):
    return node if isinstance(node,str) else ''.join(plain(c) for c in node['children'])

def safe(node):
    if isinstance(node,str): return [node]
    tag=node['tag']
    if tag in DROP: return []
    # Remove a copied subscription widget, preserving the editorial text.
    if tag=='p' and plain(node).startswith('Thanks for reading FOREIGN’s Substack!'): return []
    children=[n for c in node['children'] for n in safe(c)]
    if tag not in ALLOWED: return children
    if tag not in VOID and not any(isinstance(c,dict) or c.strip() for c in children): return children
    attrs=node['attrs']
    out={'tag':tag,'children':children}
    if tag=='img':
        out.update(sourceUrl=attrs.get('src',''),alt=attrs.get('alt',''))
    if tag=='a':
        href=attrs.get('href','')
        if href.startswith(('https://','http://','mailto:','#','/')): out['href']=href
    return [out]

def nodes(tree):
    for n in tree:
        if isinstance(n,dict):
            yield n
            yield from nodes(n['children'])

def download(url):
    target='/images/commentaries/inline/'+hashlib.sha256(url.encode()).hexdigest()[:16]+'.webp'
    path=ROOT/'public'/target.lstrip('/')
    try:
        with Image.open(path) as existing: existing.verify()
        valid=True
    except (OSError, ValueError): valid=False
    if not valid:
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(request,timeout=40) as response: raw=response.read()
        im=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
        im.thumbnail((1600,1800))
        path.parent.mkdir(parents=True,exist_ok=True)
        buffer=io.BytesIO();im.save(buffer,'WEBP',quality=85)
        path.write_bytes(buffer.getvalue())
    with Image.open(path) as im: width,height=im.size
    return dict(src=target,width=width,height=height)

posts=[p for p in json.load(open(sys.argv[1])) if 1 in p['categories']]
articles=[]
for post in posts:
    parser=Parser();parser.feed(post['content']['rendered'])
    articles.append(dict(id=str(post['id']),sourceUrl=post['link'],content=[n for c in parser.root['children'] for n in safe(c)]))
urls={n['sourceUrl'] for a in articles for n in nodes(a['content']) if n['tag']=='img'}
media={}; failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    futures={pool.submit(download,url):url for url in urls}
    for future in concurrent.futures.as_completed(futures):
        url=futures[future]
        try: media[url]=future.result()
        except Exception as error: failures.append(dict(url=url,error=str(error)))
for article in articles:
    for n in nodes(article['content']):
        if n['tag']=='img':
            if n['sourceUrl'] in media: n.update(media[n['sourceUrl']])
            else: n['unavailable']=True
    path=ROOT/'public/content/commentaries'/f"{article['id']}.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(article,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(articles=len(articles),images=len(media),failures=failures),indent=2))
