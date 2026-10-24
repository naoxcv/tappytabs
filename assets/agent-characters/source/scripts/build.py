import numpy as np, math, potrace, cairosvg
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import disk, binary_opening, binary_erosion
U='/mnt/user-data/uploads/'
def hexrgb(h): return np.array([int(h[i:i+2],16) for i in (1,3,5)],float)

def smooth_mask(m, sigma):
    return ndi.gaussian_filter(m.astype(float), sigma) > 0.5

def largest(m, n=1, minarea=0):
    lab,k=ndi.label(m)
    if k==0: return m
    areas=ndi.sum(m,lab,range(1,k+1))
    keep=[i+1 for i in np.argsort(-areas)[:n] if areas[i]>=minarea]
    return np.isin(lab,keep)

from skimage.measure import find_contours
def contour_polys(mask, sigma, spacing):
    m=np.pad(mask,6)
    f=ndi.gaussian_filter(m.astype(float),sigma)
    polys=[]
    for c in find_contours(f,0.5):
        if np.hypot(*(c[0]-c[-1]))>1: continue
        c=c[:-1][:,::-1]-6   # (x,y), undo pad
        seg=np.hypot(*np.diff(np.vstack([c,c[:1]]),axis=0).T); L=seg.sum()
        if L<150: continue
        t=np.concatenate([[0],np.cumsum(seg)])
        n=max(12,int(L/spacing))
        u=np.linspace(0,L,n,endpoint=False)
        cc=np.vstack([c,c[:1]])
        x=np.interp(u,t,cc[:,0]); y=np.interp(u,t,cc[:,1])
        # light circular smoothing of the resampled points
        k=1.0
        x=ndi.gaussian_filter1d(x,k,mode='wrap'); y=ndi.gaussian_filter1d(y,k,mode='wrap')
        polys.append(np.stack([x,y],1))
    return polys

def trace(mask):
    bm=potrace.Bitmap(~mask)
    pl=bm.trace(turdsize=40,turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,alphamax=1.25,opticurve=True,opttolerance=1.2)
    return pl

def curves_to_d(pl, T):
    d=[]
    for c in pl:
        p=T(c.start_point); d.append('M%.2f %.2f'%p)
        for s in c.segments:
            if s.is_corner:
                d.append('L%.2f %.2f L%.2f %.2f'%(*T(s.c),*T(s.end_point)))
            else:
                d.append('C%.2f %.2f %.2f %.2f %.2f %.2f'%(*T(s.c1),*T(s.c2),*T(s.end_point)))
        d.append('Z')
    return ''.join(d)

def capsule(cx,cy,h,w_top,w_bot,ang,n=96):
    rt,rb=w_top/2,w_bot/2
    L=h-rt-rb
    c1=np.array([0,-L/2]); c2=np.array([0,L/2])
    # tangent hull of two circles (approx. via sampled union hull)
    pts=[]
    for t in np.linspace(math.pi,2*math.pi,n//2,endpoint=False): pts.append(c1+rt*np.array([math.cos(t),math.sin(t)]))
    for t in np.linspace(0,math.pi,n//2,endpoint=False): pts.append(c2+rb*np.array([math.cos(t),math.sin(t)]))
    pts=np.array(pts)
    # y offset so bbox centre = cy
    pts[:,1]-= (pts[:,1].min()+pts[:,1].max())/2
    a=math.radians(ang); R=np.array([[math.cos(a),-math.sin(a)],[math.sin(a),math.cos(a)]])
    return pts@R.T+np.array([cx,cy])

def catmull_path(pts, T):
    P=[T(p) for p in pts]; n=len(P)
    d='M%.2f %.2f'%P[0]
    for i in range(n):
        p0,p1,p2,p3=P[(i-1)%n],P[i],P[(i+1)%n],P[(i+2)%n]
        c1=(p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6)
        c2=(p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6)
        d+='C%.2f %.2f %.2f %.2f %.2f %.2f'%(*c1,*c2,*p2)
    return d+'Z'

# ---------- configs ----------
# eyes: (cx,cy,h,w_top,w_bot,tilt_deg)  tilt>0 = top leans right
CFG={
 'mushroom':dict(f='ChatGPT_Image_Oct_24__2026__02_43_39_AM.png',
   pal={'cap':'#74594f','stem':'#fed8bb','star':'#f4cdaf'},
   eyes=[(979.0,1508,172,90,90,0),(1139.0,1508,168,88,88,0)]),
 'bokchoy':dict(f='ChatGPT_Image_Oct_24__2026__02_43_51_AM.png',
   pal={'leaf':'#639458','cream':'#fef5df','vein':'#47763c'},
   eyes=[(960.5,1453,216,122,122,0),(1170.5,1453,212,118,118,0)]),
 'tomato':dict(f='ChatGPT_Image_Oct_24__2026__02_43_56_AM.png',
   pal={'red':'#b13e3e','calyx':'#477349'},
   eyes=[(876,1050,292,86,86,27),(1176,1050,288,100,100,-27)]),
 'garlic':dict(f='ChatGPT_Image_Oct_24__2026__02_44_00_AM.png',
   pal={'cream':'#fff6df','line':'#e0ca98'},
   eyes=[(909.0,1206,282,112,112,0),(1149.0,1206,278,100,100,0)]),
}
OUT=1024; 

def extract(name,cfg):
    a=np.array(Image.open(U+cfg['f']))
    rgb=a[...,:3].astype(float); op=a[...,3]>127
    sil=ndi.binary_fill_holes(op)
    solid=a[...,3]>250
    keys=list(cfg['pal']); cent=np.array([hexrgb(cfg['pal'][k]) for k in keys])
    d=((rgb[...,None,:]-cent[None])**2).sum(-1)
    cls=d.argmin(-1); cls[~solid]=-1
    C={k:(cls==i) for i,k in enumerate(keys)}
    return sil,C

def build(name,cfg):
    sil,C=extract(name,cfg)
    op=lambda m,r: binary_opening(m,disk(r))
    layers=[]   # (color, mask, sigma) bottom->top
    P=cfg['pal']
    if name=='mushroom':
        cap=largest(op(C['cap'],5)); cap=ndi.binary_fill_holes(cap)
        star=largest(op(C['star'],5)&ndi.binary_dilation(cap,iterations=2)) & ~largest(op(C['stem'],5)) 
        # star is the enclosed hole of cap
        hole=ndi.binary_fill_holes(op(C['cap'],5))&~op(C['cap'],5); star=largest(hole,1,2000)
        upper=cap
        base=(sil&~upper)|binary_erosion(upper,disk(24))
        layers=[(P['stem'],base,17),(P['cap'],cap,17),(P['star'],star,3)]
    elif name=='bokchoy':
        leafm=op(C['leaf']|C['vein'],5); leaf=largest(ndi.binary_fill_holes(leafm))
        vein=largest(op(C['vein'],2),1,300)
        base=(sil&~leaf)|binary_erosion(leaf,disk(24))
        layers=[(P['cream'],base,17),(P['leaf'],leaf,17),(P['vein'],vein,2.2)]
    elif name=='tomato':
        cal=largest(ndi.binary_fill_holes(op(C['calyx'],4)))
        base=(sil&~cal)|binary_erosion(cal,disk(24))
        layers=[(P['red'],base,17),(P['calyx'],cal,3.5)]
    elif name=='garlic':
        ln=op(C['line'],1); lab,k=ndi.label(ln); 
        ar=ndi.sum(ln,lab,range(1,k+1)); ln=np.isin(lab,[i+1 for i in range(k) if ar[i]>800])
        layers=[(P['cream'],sil,17),(P['line'],ln,2.0)]
    res=[]
    for col,m,sg in layers:
        sp = 36 if sg>=8 else 7
        res.append((col,contour_polys(m,sg,sp),smooth_mask(m,sg)))
    eyes=[capsule(*e) for e in cfg['eyes']]
    return res,eyes,smooth_mask(sil,6)

def render(name,cfg,scale_k=None):
    res,eyes,silm=build(name,cfg)
    ys,xs=np.where(silm); x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
    return res,eyes,(x0,x1,y0,y1)

if __name__=='__main__':
    data={n:render(n,c) for n,c in CFG.items()}
    # consistent optical scale: geometric-mean size target, capped by max dimension
    K=600; MAXD=760
    scales={}
    for n,(r,e,(x0,x1,y0,y1)) in data.items():
        w,h=x1-x0,y1-y0; s=min(K/math.sqrt(w*h)*1.0, MAXD/max(w,h)); scales[n]=s
        print(n,'bbox',w,h,'scale %.3f -> %.0fx%.0f'%(s,w*s,h*s))
    for n,(r,e,(x0,x1,y0,y1)) in data.items():
        s=scales[n]; cx,cy=(x0+x1)/2,(y0+y1)/2
        T=lambda p,s=s,cx=cx,cy=cy:((( p.x if hasattr(p,'x') else p[0])-cx)*s+OUT/2,((p.y if hasattr(p,'y') else p[1])-cy)*s+OUT/2)
        paths=[]
        for i,(col,pl,_) in enumerate(r):
            d=''.join(catmull_path(pp,T) for pp in pl)
            if i==0:
                d+=''.join(catmull_path(ep,T) for ep in e)
                paths.append('<path fill="%s" fill-rule="evenodd" d="%s"/>'%(col,d))
            else:
                paths.append('<path fill="%s" fill-rule="evenodd" d="%s"/>'%(col,d))
        svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">\n%s\n</svg>\n'%(OUT,OUT,OUT,OUT,'\n'.join(paths))
        open('/mnt/user-data/outputs/icons/%s.svg'%n,'w').write(svg)
        cairosvg.svg2png(bytestring=svg.encode(),write_to='/mnt/user-data/outputs/icons/%s.png'%n,output_width=1024,output_height=1024)
        print('wrote',n)
