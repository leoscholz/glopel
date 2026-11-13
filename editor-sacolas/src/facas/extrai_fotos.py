import pdfplumber, glob, subprocess, os, numpy as np, pikepdf
from PIL import Image
OUT='/tmp/gab/fotos'; os.makedirs(OUT,exist_ok=True)
PAINT={'S','s','f','F','f*','B','B*','b','b*','sh'}
def so_imagens(src,dst,manter):
    pdf=pikepdf.open(src); pg=pdf.pages[0]
    ops=pikepdf.parse_content_stream(pg)
    novo=[]; skip_text=False
    for operands,op in ops:
        o=str(op)
        if o=='BT': skip_text=True; continue
        if o=='ET': skip_text=False; continue
        if skip_text: continue
        if o in PAINT: novo.append(([],pikepdf.Operator('n'))); continue
        if o in ('Tj','TJ',"'",'"'): continue
        if o=='Do' and str(operands[0]).lstrip('/') not in manter: continue
        novo.append((operands,op))
    pg.Contents=pdf.make_stream(pikepdf.unparse_content_stream(novo))
    pdf.save(dst)
for f in sorted(glob.glob('/mnt/user-data/uploads/GABARITOS/*.pdf')):
    nome=os.path.basename(f)[:-4]
    pg=pdfplumber.open(f).pages[0]
    ims=[i for i in pg.images if i['srcsize']!=(168,167) and (i['x1']-i['x0'])*(i['bottom']-i['top'])>1500]
    ims=[i for i in ims if (i['x1']-i['x0'])<pg.width*0.5]
    grandes=sorted(ims,key=lambda i:-(i['x1']-i['x0'])*(i['bottom']-i['top']))[:2]
    if len(grandes)==2 and abs(grandes[0]['top']-grandes[1]['top'])>(grandes[0]['bottom']-grandes[0]['top'])*0.3:
        tb=max(g['top'] for g in grandes); grp=[i for i in ims if i['top']<tb-5]
    else: grp=ims
    x0=min(i['x0'] for i in grp)-6; x1=max(i['x1'] for i in grp)+6; y0=min(i['top'] for i in grp)-6; y1=max(i['bottom'] for i in grp)+6
    manter={i['name'] for i in grp}
    so_imagens(f,'/tmp/gab/so.pdf',manter)
    dpi=max(40,min(260,int(72*760/(y1-y0))))
    subprocess.run(['pdftoppm','-r',str(dpi),'-png','-singlefile','-x',str(int(x0*dpi/72)),'-y',str(int(y0*dpi/72)),'-W',str(int((x1-x0)*dpi/72)),'-H',str(int((y1-y0)*dpi/72)),'/tmp/gab/so.pdf',OUT+'/tmp'],check=True)
    im=np.asarray(Image.open(OUT+'/tmp.png').convert('RGB')).astype(float)
    m=int(min(im.shape[:2])*0.04)+6
    ring=np.concatenate([im[m,m:-m],im[m:-m,m],im[m:-m,-m]])
    bg=np.median(ring,axis=0)
    im=np.where((np.abs(im-255).max(axis=2)<4)[...,None], bg, im)   # borda branca de fora = fundo
    d=np.abs(im-bg).max(axis=2); lum=im.mean(axis=2)
    neutro=(im.max(axis=2)-im.min(axis=2))<12
    a=np.clip((d-4)/30,0,1)
    sombra=neutro&(lum<bg.mean()-2)
    a=np.where(sombra, np.clip((bg.mean()-lum)/bg.mean()*2.4,0,0.75), a)
    rgb=np.where(sombra[...,None], 25, im)
    for y in range(a.shape[0]):
        lin=(a[y]>0.3)&neutro[y]
        cob=lambda yy: (a[min(max(yy,0),a.shape[0]-1)]>0.3).mean()
        if lin.mean()>0.5 and min(cob(y-4),cob(y+4))<0.15: a[max(0,y-1):y+2]=0
    import scipy.ndimage as nd
    lab,n=nd.label(nd.binary_dilation(a>0.08,iterations=4))
    if n>1:
        tam=nd.sum(np.ones_like(a),lab,range(1,n+1)); k=1+int(np.argmax(tam)); a=np.where(lab==k,a,0)
    img=Image.fromarray(np.dstack([rgb,a*255]).astype(np.uint8),'RGBA')
    bb=Image.fromarray((a>0.06).astype(np.uint8)*255).getbbox(); img=img.crop(bb)
    img.thumbnail((380,560))
    img.save(f'{OUT}/{nome}.webp','WEBP',quality=82,method=6)
    print(nome, img.size, os.path.getsize(f'{OUT}/{nome}.webp'), 'bg',bg.round())
