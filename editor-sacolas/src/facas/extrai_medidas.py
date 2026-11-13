import pdfplumber, sys, collections, json
K=72/2.54
def ext(f):
    pg=pdfplumber.open(f).pages[0]
    cs=[(c['x0'],c['x1'],c['top'],c['bottom']) for c in pg.curves]
    # fold line = most common bottom among tall curves
    tall=[c for c in cs if (c[3]-c[2])>pg.height*0.2 and (c[1]-c[0])<pg.width*0.5 and c[0]<pg.width*0.75]
    fold=collections.Counter(round(c[3]) for c in tall).most_common(1)[0][0]
    body=sorted({(round(c[0],1),round(c[1],1),round(c[2],1)) for c in tall if abs(c[3]-fold)<2})
    flaps=sorted({(round(c[0],1),round(c[1],1),round(c[3],1)) for c in cs if abs(c[2]-fold)<2 and (c[3]-c[2])<pg.height*0.2 and (c[1]-c[0])>20})
    return fold, body, flaps
for f in sys.argv[1:]:
    fold,body,flaps=ext(f)
    print('==',f.split('/')[-1])
    for b in body: print('  painel x %.2f-%.2f  w=%.2f  h=%.2f'%(b[0]/K,b[1]/K,(b[1]-b[0])/K,(fold-b[2])/K))
    for b in flaps: print('  aba    x %.2f-%.2f  w=%.2f  d=%.2f'%(b[0]/K,b[1]/K,(b[1]-b[0])/K,(b[2]-fold)/K))
