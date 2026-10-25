import numpy as np, math, cairosvg, cv2, warnings
warnings.filterwarnings('ignore')
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.morphology import disk, binary_opening, binary_erosion
from build import contour_polys, catmull_path, capsule, largest, hexrgb
U='/mnt/user-data/uploads/Untitled_Artwork_%d.png'
O=lambda m,r: binary_opening(m,disk(r)); E=lambda m,r: binary_erosion(m,disk(r)); D=lambda m,r: ndi.binary_dilation(m,structure=disk(r))
def comps(m,minarea):
    lab,k=ndi.label(m); return [lab==i for i in range(1,k+1) if (lab==i).sum()>=minarea]
def bez(p0,p1,p2,n=40):
    t=np.linspace(0,1,n)[:,None]; return ((1-t)**2*np.array(p0)+2*(1-t)*t*np.array(p1)+t**2*np.array(p2)).astype(np.int32)
def make_hat(dx,dy):
    im=Image.new('L',(2048,2048),0); d=ImageDraw.Draw(im)
    for (x,y,r) in [(770,560,150),(1190,560,150),(860,430,165),(1100,430,165),(980,440,165)]: d.ellipse([x+dx-r,y+dy-r,x+dx+r,y+dy+r],fill=255)
    d.polygon([(770+dx,560+dy),(1190+dx,560+dy),(1190+dx,710+dy),(770+dx,710+dy)],fill=255)
    d.polygon([(730+dx,690+dy),(1230+dx,690+dy),(1230+dx,872+dy),(730+dx,872+dy)],fill=255)
    hat=np.array(im)>127
    fl=np.zeros((2048,2048),np.uint8)
    for pts in [bez((730,716),(980,734),(1230,716)),bez((870,500),(845,610),(868,706)),bez((1090,500),(1118,610),(1092,706))]:
        cv2.polylines(fl,[(pts+[dx,dy]).reshape(-1,1,2)],False,255,16,cv2.LINE_AA)
    fold=(fl>127)&E(hat,10)
    xh=np.arange(640,1175); yt=838-(xh-640)*0.073-12*np.sin(np.pi*(xh-640)/535)
    pm=Image.new('L',(2048,2048),0); ImageDraw.Draw(pm).polygon([(int(x+dx),int(y+dy)) for x,y in zip(xh,yt)]+[(1175+dx,930+dy),(640+dx,930+dy)],fill=255)
    return hat,fold,np.array(pm)>127
def measure(parts):
    m=np.zeros((2048,2048),bool)
    for p in parts: m|=p
    ys,xs=np.where(m); c=np.array([xs.mean(),ys.mean()]); X=np.stack([xs,ys],1)-c
    ev,evec=np.linalg.eigh(np.cov(X.T)); v=evec[:,1]
    if v[0]<0: v=-v
    n=np.array([-v[1],v[0]]); a=X@v; b=X@n
    return dict(c=c,phi=math.degrees(math.atan2(v[1],v[0])),L=np.percentile(a,99.5)-np.percentile(a,0.5),W=np.percentile(b,99.5)-np.percentile(b,0.5))

CFG={32:dict(name='spice-1-mild',body='#f5843f',stripe='#db5b30',fold='#e7ddc7',eyes='pill'),
     33:dict(name='spice-2-medium',body='#eb5d2f',stripe='#dd4d24',fold='#e7dec7',eyes='pill',steam=True),
     34:dict(name='spice-3-hot',body='#cf4a31',stripe='#c53c26',fold='#e8dec7',eyes='fire',fl='#feaa3f',fd='#dd6b2d'),
     35:dict(name='spice-4-inferno',body='#cf4a30',stripe='#c53c26',fold='#eadfc6',eyes='fire',fl='#ffaa40',fd='#dd6b2d',bg=True,off=(35,138))}
HAT='#fef5df'; TXS=0.426
def build(k,cfg):
    a=np.array(Image.open(U%k).convert('RGBA')); rgb=a[...,:3].astype(float); op=a[...,3]>127; solid=a[...,3]>250
    dx,dy=cfg.get('off',(0,0))
    keys=['body','stripe','cream']+(['fl','fd'] if 'fl' in cfg else [])
    pal={'body':cfg['body'],'stripe':cfg['stripe'],'cream':HAT,'fl':cfg.get('fl'),'fd':cfg.get('fd')}
    cent=np.array([hexrgb(pal[x]) for x in keys]+[hexrgb(cfg['fold'])])
    cls=((rgb[...,None,:]-cent[None])**2).sum(-1).argmin(-1); cls[~solid]=-1
    C={x:cls==i for i,x in enumerate(keys)}; C['cream']|=cls==len(keys)  # fold counts as cream
    # holes
    lab,n=ndi.label(~op); holes=[]
    for i in range(1,n+1):
        m=lab==i; ys,xs=np.where(m)
        if 800<m.sum()<400000 and ys.min()>0 and xs.min()>0 and ys.max()<2047 and xs.max()<2047: holes.append((m,xs.mean(),ys.mean(),m.sum()))
    mouth=[h for h in holes if h[3]>9000 and h[2]>1380+dy-10 and abs(h[1]-(989+dx))<60][0][0]
    brows=[h for h in holes if h[3]<6000]; eyes_h=[h for h in holes if 15000<h[3]]
    bl=[h[0] for h in brows if h[1]<1000+dx]; br=[h[0] for h in brows if h[1]>=1000+dx]
    ml,mr=measure(bl),measure(br)
    hat,fold,pm=make_hat(dx,dy)
    # old hat / steam
    cr=O(C['cream'],5); cc=comps(cr,3000); cc.sort(key=lambda m:-m.sum()); hat_old=ndi.binary_fill_holes(cc[0])
    steam=None
    if cfg.get('steam'): steam=ndi.binary_fill_holes(np.any([c for c in cc[1:]],axis=0)) if len(cc)>1 else None
    out={}
    if cfg.get('bg'):
        head=largest(ndi.binary_fill_holes(O(C['body']|C['stripe'],5)))|pm
    else:
        sil=ndi.binary_fill_holes(op); head=(sil&~D(hat_old,6)&~D(C['cream'],4))|pm
        if steam is not None: head&=~D(steam,8)
    # stripes (thicker, inside head, run under hat)
    st=O(C['stripe'],2); st=np.any(comps(st,400),axis=0)
    headm=ndi.gaussian_filter(head.astype(float),13)>0.5
    st=D(st,7)&E(headm,2)
    st=st|(E(hat,22)&ndi.binary_dilation(st,structure=np.ones((81,1)))&ndi.binary_dilation(st,iterations=40))
    base=head|E(hat,24)
    stripe_keep=None
    # brows: mirrored clean capsules
    phi=(ml['phi']-mr['phi'])/2; L=(ml['L']+mr['L'])/2*0.96; W=(ml['W']+mr['W'])/2
    mid=1026+dx; dxb=((mid-ml['c'][0])+(mr['c'][0]-mid))/2; yb=(ml['c'][1]+mr['c'][1])/2
    th=90-phi
    brow_p=[capsule(mid-dxb,yb,L,W,W,-th),capsule(mid+dxb,yb,L*0.97,W,W,th)]
    bm=Image.new('L',(2048,2048),0); dr=ImageDraw.Draw(bm)
    for p in brow_p: dr.polygon([tuple(q) for q in p],fill=255)
    brow_mask=np.array(bm)>127
    cuts=list(brow_p)
    if cfg['eyes']=='pill':
        ey=1275+dy; sp=440
        cuts+=[capsule(mid-sp/2,ey,184,120,124,0),capsule(mid+sp/2,ey,178,122,126,0)]
    layers=[]
    if steam is not None: layers.append((HAT,steam,9,20,False))
    if cfg.get('bg'):
        L_=O(C['fl'],3); D_=O(C['fd'],4); un=L_|D_; bgc=[c for c in comps(un,5000) if (c&~head).sum()>0]
        bg=np.any(bgc,axis=0); fp=D(hat_old,6)&~head
        valid=bg; idx=ndi.distance_transform_edt(~valid,return_indices=True)[1]
        nearD=D_[idx[0],idx[1]]; fill=fp&~valid
        bgD=(D_&bg)|(fill&nearD&~D(fill&~nearD,0)); bgL=bg|fill
        bgL=ndi.binary_fill_holes(binary_closing_safe(bgL)) if False else ndi.binary_fill_holes(bgL)
        layers.append((cfg['fl'],bgL|(D(bgL,14)&head),7,18,False)); layers.append((cfg['fd'],bgD|(D(bgD,14)&head),6,16,False))
    st=st&~D(brow_mask,3)
    layers.append((cfg['body'],base,13,26,True)); layers.append((cfg['stripe'],st,3.5,7,False))
    if cfg['eyes']=='fire':
        eyeL=[c for c in comps(O(C['fl']|C['fd'],3),3000) if (c&~head).sum()==0] if True else []
        eyeLm=ndi.binary_fill_holes(np.any(eyeL,axis=0))&~brow_mask
        eyeD=O(C['fd'],4)&eyeLm; eyeD=np.any(comps(eyeD,300),axis=0)
        layers.append((cfg['fl'],eyeLm,3.5,8,False)); layers.append((cfg['fd'],eyeD,2.5,7,False))
    layers.append((HAT,hat,9,24,False)); layers.append((cfg['fold'],fold,2.5,7,False))
    polys=[(c,contour_polys(m,s,sp),m,cut) for c,m,s,sp,cut in layers]
    mouthp=contour_polys(mouth,3.0,7)
    return polys,mouthp,cuts

if __name__=='__main__':
    res={}
    for k,cfg in CFG.items(): res[k]=build(k,cfg); print(cfg['name'],'ok')
    # shared transform: scale TXS, centre on own bbox
    import pickle; pickle.dump(res,open('spice.pkl','wb'))
