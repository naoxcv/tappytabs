import pickle, numpy as np, cairosvg
from PIL import Image, ImageDraw
from build import catmull_path
from build_spice import CFG, TXS
res=pickle.load(open('spice.pkl','rb')); names=[]
for k,(polys,mouthp,cuts) in res.items():
    pts=np.vstack([q for _,pp,_,_ in polys for q in pp]); x0,y0=pts.min(0); x1,y1=pts.max(0)
    s=min(TXS,880/max(x1-x0,y1-y0)); cx,cy=(x0+x1)/2,(y0+y1)/2
    T=lambda p,s=s,cx=cx,cy=cy:((p[0]-cx)*s+512,(p[1]-cy)*s+512)
    out=[]
    for col,pp,_,cut in polys:
        d=''.join(catmull_path(q,T) for q in pp)
        if cut: d+=''.join(catmull_path(q,T) for q in mouthp)+''.join(catmull_path(q,T) for q in cuts)
        out.append('<path fill="%s" fill-rule="evenodd" d="%s"/>'%(col,d))
    n=CFG[k]['name']; names.append(n)
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">\n%s\n</svg>\n'%'\n'.join(out)
    open('/mnt/user-data/outputs/spice/%s.svg'%n,'w').write(svg)
    cairosvg.svg2png(bytestring=svg.encode(),write_to='/mnt/user-data/outputs/spice/%s.png'%n,output_width=1024,output_height=1024)
sheet=Image.new('RGB',(4*420+20,880),(244,245,247)); d=ImageDraw.Draw(sheet)
for row,bg in enumerate([(255,255,255),(36,38,42)]):
    for i,n in enumerate(names):
        x=20+i*420; y=20+row*430; d.rounded_rectangle([x,y,x+400,y+400],50,fill=bg,outline=(225,227,230))
        r=Image.open('/mnt/user-data/outputs/spice/%s.png'%n).convert('RGBA').resize((400,400),Image.LANCZOS); sheet.paste(r,(x,y),r)
sheet.save('/mnt/user-data/outputs/spice/preview.png'); print(names)
