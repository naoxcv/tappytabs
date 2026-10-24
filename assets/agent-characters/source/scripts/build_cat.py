import numpy as np, math, cairosvg
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import disk, binary_opening, binary_erosion
from build import contour_polys, catmull_path, capsule, largest, hexrgb
a=np.array(Image.open('/mnt/user-data/uploads/Untitled_Artwork_31.png').convert('RGBA'))
rgb=a[...,:3].astype(float); op=a[...,3]>127; solid=a[...,3]>250
# holes: eyes + mouth
lab,n=ndi.label(~op); mouth=None
for i in range(1,n+1):
    m=lab==i; ys,xs=np.where(m)
    if m.sum()>3000 and ys.min()>0 and xs.min()>0 and abs(xs.mean()-989)<30 and abs(ys.mean()-1452)<30: mouth=m
sil=ndi.binary_fill_holes(op)
pal={'body':'#ffab40','hat':'#fef5df','stripe':'#dd6c2d','fold':'#e8dec7'}
keys=list(pal); cent=np.array([hexrgb(pal[k]) for k in keys])
cls=((rgb[...,None,:]-cent[None])**2).sum(-1).argmin(-1); cls[~solid]=-1
C={k:cls==i for i,k in enumerate(keys)}
O=lambda m,r: binary_opening(m,disk(r))
hat_old=largest(ndi.binary_fill_holes(O(C['hat']|C['fold'],5)))
# ---- new toque, drawn in original 2048 coords ----
from PIL import ImageDraw
import cv2
def band_y(x): return 850+50*(1-((x-910)/220)**2)
im=Image.new('L',(2048,2048),0); d=ImageDraw.Draw(im)
for (x,y,r) in [(770,560,150),(1190,560,150),(860,430,165),(1100,430,165),(980,440,165)]:
    d.ellipse([x-r,y-r,x+r,y+r],fill=255)
d.polygon([(770,560),(1190,560),(1190,710),(770,710)],fill=255)
d.polygon([(730,690),(1230,690),(1230,872),(730,872)],fill=255)
hat=np.array(im)>127
sil_head=sil&~ndi.binary_dilation(hat_old,iterations=6)&~ndi.binary_dilation(C['hat']|C['fold'],iterations=4)
xh=np.arange(640,1175); yt=838-(xh-640)*0.073-12*np.sin(np.pi*(xh-640)/535)
pm=Image.new('L',(2048,2048),0); ImageDraw.Draw(pm).polygon([(int(x),int(y)) for x,y in zip(xh,yt)]+[(1175,930),(640,930)],fill=255)
sil_head=sil_head|(np.array(pm)>127)
# fold lines (soft strokes)
def bez(p0,p1,p2,n=40):
    t=np.linspace(0,1,n)[:,None]; return ((1-t)**2*np.array(p0)+2*(1-t)*t*np.array(p1)+t**2*np.array(p2)).astype(np.int32)
fl=np.zeros((2048,2048),np.uint8)
for pts in [bez((730,716),(980,734),(1230,716)),bez((870,500),(845,610),(868,706)),bez((1090,500),(1118,610),(1092,706))]:
    cv2.polylines(fl,[pts.reshape(-1,1,2)],False,255,16,cv2.LINE_AA)
fold=(fl>127)&binary_erosion(hat,disk(10))
# stripes: slightly thicker, kept inside the head
st=O(C['stripe'],2); lab2,k=ndi.label(st); ar=ndi.sum(st,lab2,range(1,k+1)); st=np.isin(lab2,[i+1 for i in range(k) if ar[i]>400])
headm=ndi.gaussian_filter(sil_head.astype(float),13)>0.5
st=ndi.binary_dilation(st,structure=disk(7))&binary_erosion(headm,disk(2))
st=st|(binary_erosion(hat,disk(22))&ndi.binary_dilation(st,structure=np.ones((81,1)),iterations=1)&ndi.binary_dilation(st,iterations=40))
base=sil_head|binary_erosion(hat,disk(24))
layers=[(pal['body'],base,13,26),(pal['stripe'],st,3.5,7),(pal['hat'],hat,9,24),(pal['fold'],fold,2.5,7)]
polys=[(c,contour_polys(m,s,sp)) for c,m,s,sp in layers]
mouthp=contour_polys(mouth,3.0,7)
# eyes: straight, level, centred on face axis
ys_=np.where(sil[1200:1350].any(0))[0]; mid=(ys_.min()+ys_.max())/2; ey=1275; sp=440
eyes=[capsule(mid-sp/2,ey,184,120,124,0),capsule(mid+sp/2,ey,178,122,126,0)]
print('face centre',mid)
yy,xx=np.where(sil); x0,x1,y0,y1=xx.min(),xx.max(),yy.min(),yy.max(); w,h=x1-x0,y1-y0
s=min(600/math.sqrt(w*h),760/max(w,h)); cx,cy=(x0+x1)/2,(y0+y1)/2; print('scale',s,w*s,h*s)
T=lambda p:((p[0]-cx)*s+512,(p[1]-cy)*s+512)
out=[]
for i,(col,pp) in enumerate(polys):
    d=''.join(catmull_path(q,T) for q in pp)
    if i==0: d+=''.join(catmull_path(q,T) for q in mouthp)+''.join(catmull_path(q,T) for q in eyes)
    out.append('<path fill="%s" fill-rule="evenodd" d="%s"/>'%(col,d))
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">\n%s\n</svg>\n'%'\n'.join(out)
open('/mnt/user-data/outputs/icons/cat.svg','w').write(svg)
cairosvg.svg2png(bytestring=svg.encode(),write_to='/mnt/user-data/outputs/icons/cat.png',output_width=1024,output_height=1024)
bg=Image.new('RGB',(2*520,520),(255,255,255)); r=Image.open('/mnt/user-data/outputs/icons/cat.png').convert('RGBA').resize((500,500),Image.LANCZOS); bg.paste(r,(10,10),r)
dk=Image.new('RGB',(520,520),(36,38,42)); dk.paste(r,(10,10),r); bg.paste(dk,(520,0)); bg.save('cat_prev.png')
