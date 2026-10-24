import re,json
names={'tomato':('Tomato','bouncy, hops a lot'),'mushroom':('Mushroom','calm, slow blinker'),'bokchoy':('Bok choy','swaying, easygoing'),'garlic':('Garlic','curious, twitchy eyes'),'cat':('Chef cat','fussy, quick to startle')}
def card(n):
    s=open('/mnt/user-data/outputs/icons/%s.svg'%n).read()
    paths=re.findall(r'<path fill="([^"]+)" fill-rule="evenodd" d="([^"]+)"/>',s)
    subs=re.findall(r'M[^Z]*Z',paths[0][1]); body,eyes=''.join(subs[:-2]),subs[-2:]
    eyem='';
    for e in eyes:
        v=[float(x) for x in re.findall(r'-?\d+\.?\d*',e)]; xs,ys=v[0::2],v[1::2]
        eyem+='<path class="eye" fill="#000" data-cx="%.1f" data-cy="%.1f" d="%s"/>'%((min(xs)+max(xs))/2,(min(ys)+max(ys))/2,e)
    g='<path fill="%s" fill-rule="evenodd" mask="url(#m-%s)" d="%s"/>'%(paths[0][0],n,body)+''.join('<path fill="%s" fill-rule="evenodd" d="%s"/>'%p for p in paths[1:])
    return '<button class="card" data-n="%s" aria-label="%s"><svg viewBox="0 0 1024 1024" aria-hidden="true"><defs><mask id="m-%s" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1424" height="1424"><rect x="-200" y="-200" width="1424" height="1424" fill="#fff"/><g class="eyes">%s</g></mask></defs><g class="body">%s</g></svg><b>%s</b><span>%s</span></button>'%(n,names[n][0],n,eyem,g,names[n][0],names[n][1])
cards=''.join(card(n) for n in names)
html=open('tpl.html').read().replace('%%CARDS%%',cards)
open('/mnt/user-data/outputs/agents-alive.html','w').write(html); print(len(html)//1024,'KB')
