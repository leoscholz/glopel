"""Fotos 3D do gerador de orçamentos (Sistema Globo › Orçamentos): cada faca personalizável do GloboEditor × papel (kraft/branco),
com a arte demonstrativa "SUA MARCA" (Assistente, estilo clássico, paleta azul). Mesma câmera do portal/render_3d.py.
Uso (da raiz do repo):  python3 sistema/orcamento/render_3d_orcamento.py . sistema/orcamento/3d [--ids f1,f5] [--estilo classico] [--pal azul]
Precisa: pip playwright + chromium (WebGL por swiftshader). ~1 min por foto; dá para rodar 3 processos em paralelo com --ids diferentes.
Saída: <saida>/<faca>_<kraft|branco>.jpg (900×1000) — o orcamento.js aponta para esses nomes (ORC_FACA)."""
import pathlib, sys, json, base64, io, argparse
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright
from PIL import Image
ap=argparse.ArgumentParser(); ap.add_argument('repo'); ap.add_argument('saida'); ap.add_argument('--ids',default=''); ap.add_argument('--pal',default='azul'); ap.add_argument('--estilo',default='classico')
ap.add_argument("--fr",type=float,default=1.4); ap.add_argument("--w",type=int,default=900); ap.add_argument('--h',type=int,default=1000); a=ap.parse_args()
R=pathlib.Path(a.repo); S=pathlib.Path(a.saida); S.mkdir(parents=True,exist_ok=True)
def handle(route):
    u=route.request.url
    if not u.startswith('https://glopel.local/'): return route.continue_()
    f=R/unquote(urlparse(u).path).lstrip('/')
    if f.is_dir(): f=f/'index.html'
    return route.fulfill(path=str(f)) if f.is_file() else route.fulfill(status=404,body='')
JS_FOTO="""async ([id,th,ph,W,H,FR,DX])=>{
  const espera=(f,ms=60000)=>new Promise((ok,no)=>{const t0=Date.now();(function v(){ if(f()) ok(); else if(Date.now()-t0>ms) no(new Error('timeout '+id)); else setTimeout(v,150);})()});
  const g0=(typeof P3!=='undefined'&&P3)?P3.gen:0; abreSacola(id); const m=$('modo'); if(m.value!=='produto'){ m.value='produto'; m.dispatchEvent(new Event('change')); } else produto();
  await espera(()=>typeof P3!=='undefined'&&P3&&P3.gen>g0&&P3.malhas.length&&$('prodmsg').style.display==='none');
  await new Promise(r=>setTimeout(r,600));
  if(P3.raf){ cancelAnimationFrame(P3.raf); P3.raf=null; } const m0=modo; modo='__foto';   // para o loop
  await new Promise(r=>setTimeout(r,80));
  const {r,scene,cam}=P3; scene.traverse(o=>{ if(o.renderOrder===-1) o.visible=false; });   // sem a grade de cm
  const pr=r.getPixelRatio(); r.setPixelRatio(1); r.setSize(W,H,false); cam.aspect=W/H; cam.updateProjectionMatrix();
  // enquadra: distância pela altura da sacola
  const box=new P3.T.Box3(); P3.malhas.forEach(x=>box.expandByObject(x)); const sz=box.getSize(new P3.T.Vector3()), c=box.getCenter(new P3.T.Vector3());
  const alvo=c.clone(); alvo.y=c.y*0.92; const fov=cam.fov*Math.PI/180, alt=Math.max(sz.y, sz.x*H/W*0.95)*FR, rad=alt/2/Math.tan(fov/2);
  const theta=Math.PI/2+th, phi=ph; alvo.x+=DX*sz.x;
  cam.position.set(alvo.x+rad*Math.sin(phi)*Math.cos(theta), alvo.y+rad*Math.cos(phi), alvo.z+rad*Math.sin(phi)*Math.sin(theta)); cam.lookAt(alvo);
  r.render(scene,cam); const url=r.domElement.toDataURL('image/png');
  scene.traverse(o=>{ if(o.renderOrder===-1) o.visible=true; }); r.setPixelRatio(pr); modo=m0; m.value='previa'; m.dispatchEvent(new Event('change'));
  const v=variacaoDe(id); return {id, pid:v&&v.id, url, n:P3.malhas.length, sz:[sz.x,sz.y,sz.z]};
}"""
with sync_playwright() as pw:
    b=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1400,'height':1000}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/*',handle); pg.goto('https://glopel.local/editor-sacolas/'); pg.wait_for_timeout(6000)
    facas=pg.evaluate("()=>Object.keys(FACA_TAB)")
    if a.ids: facas=a.ids.split(',')
    ids=[f+'_'+p for f in facas for p in ('kraft','branco')]
    pg.evaluate("""([ids,pal,est])=>{ design.carrinho=ids.slice(); ids.forEach(id=>{ if(!design.sacolas[id]) design.sacolas[id]={camadas:[],estado:'vazia'}; }); design.atual=ids[0];
      WZ={passo:0,dados:{nome:'SUA MARCA',slogan:'Panificadora e Confeitaria',telefone:'(41) 0000-0000',instagram:'@suamarca',endereco:'',extra:''},estilo:est,pal:pal};
      aplicaAssistente(); }""",[ids,a.pal,a.estilo]); pg.wait_for_timeout(1500)
    print('carrinho', pg.evaluate("()=>design.carrinho.length"), 'erros', errs[:3])
    meta={}
    for id in ids:
        try: r=pg.evaluate(JS_FOTO,[id,0.42,1.0,a.w,a.h,a.fr,0.0])
        except Exception as e: print('falhou',id,e); continue
        im=Image.open(io.BytesIO(base64.b64decode(r['url'].split(',')[1]))).convert('RGB')
        im.save(S/f'{id}.jpg','JPEG',quality=86,optimize=True); meta[id]=r['sz']; print(id,'ok',(S/f'{id}.jpg').stat().st_size//1024,'KB')
    (S/'meta.json').write_text(json.dumps(meta)); print('erros',errs[:5]); b.close()
