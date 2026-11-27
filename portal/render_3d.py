"""Fotos 3D do portal do cliente: a "Visualização 3D" do GloboEditor, ¾ e um pouco de cima, com a arte do cliente.
Uso:
  python3 portal/render_3d.py --token <TOKEN> --saida /tmp/fotos        # pega os produtos do cliente (portal_get) e as artes (portal_artes)
  python3 portal/render_3d.py --exemplo --ids f1_kraft,f5_kraft          # arte de exemplo (Trigo de Ouro)
Saída: <saida>/<pid>.webp (foto principal) e <pid>_2.webp (outro lado, mais de cima) + <saida>/fotos.sql
  fotos.sql troca img/img2 dos produtos do cliente por data:image/webp (as fotos ficam NO BANCO, não no GitHub público).
  Com --pasta-repo portal/img/<nome>, grava os arquivos no repo e o SQL aponta para eles (só para dados fictícios).
Precisa: pip playwright + chromium (WebGL por swiftshader). Roda com o GloboEditor local (editor-sacolas/index.html)."""
import pathlib, sys, json, base64, argparse
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright
ap=argparse.ArgumentParser(); ap.add_argument('--token'); ap.add_argument('--ids',default='f05_kraft,f1_kraft,f2_kraft,f3_kraft,f5_kraft')
ap.add_argument('--saida',default='out'); ap.add_argument('--theta',type=float,default=0.42); ap.add_argument('--phi',type=float,default=0.98)
ap.add_argument('--fr',type=float,default=1.32); ap.add_argument('--dx',type=float,default=0.08); ap.add_argument('--exemplo',action='store_true'); ap.add_argument('--pasta-repo',dest='pasta'); ap.add_argument('--w',type=int,default=720); ap.add_argument('--h',type=int,default=900); a=ap.parse_args()
R=pathlib.Path(__file__).resolve().parent.parent; S=pathlib.Path(a.saida); S.mkdir(exist_ok=True)
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
import io, urllib.request
from PIL import Image
SB='https://dzfelcufnsltutxeidow.supabase.co'; KEY='sb_publishable_kKBiEe6G8D_uEYO8NiWDCA_foi3zxwl'
def rpc(fn,args):
    rq=urllib.request.Request(f'{SB}/rest/v1/rpc/{fn}',data=json.dumps(args).encode(),headers={'apikey':KEY,'Authorization':'Bearer '+KEY,'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(rq,timeout=30).read() or 'null')
PIDS=None
if a.token:
    d=rpc('portal_get',{'p_token':a.token})
    if not d: sys.exit('token inválido')
    PIDS=[p['pid'] for p in d['produtos']]; print('cliente:',d['nome'],'·',len(PIDS),'produtos')
JS_IDS="""(pids)=>pids.map(pid=>{ const ids=Object.keys(CATALOGO).filter(id=>{const v=variacaoDe(id); return v&&v.id===pid;});
  const com=ids.filter(id=>design.sacolas[id]&&design.sacolas[id].camadas&&design.sacolas[id].camadas.length); return [pid,(com[0]||ids[0]||null)]; })"""
def webp(png, nome):
    im=Image.open(io.BytesIO(png)).convert('RGB'); b=io.BytesIO(); im.save(b,'WEBP',quality=80,method=6)
    (S/nome).write_bytes(b.getvalue()); return b.getvalue()
with sync_playwright() as pw:
    b=pw.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    pg=b.new_page(viewport={'width':1400,'height':1000}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.route('**/*',handle)
    pg.goto('https://glopel.local/editor-sacolas/'+(f'?wa={a.token}' if a.token else '')); pg.wait_for_timeout(4000)
    pg.wait_for_timeout(3000)
    pares = pg.evaluate(JS_IDS, PIDS) if PIDS else [[None,i] for i in a.ids.split(',')]
    if a.exemplo: pg.evaluate("(ids)=>{ design.carrinho=ids; design.atual=ids[0]; carregaExemplo(); }", [i for _,i in pares if i]); pg.wait_for_timeout(800)
    fotos={}
    for pid,id in pares:
        if not id: print('sem faca para', pid); continue
        r1=pg.evaluate(JS_FOTO,[id,a.theta,a.phi,a.w,a.h,a.fr,a.dx]); pid=pid or r1['pid']
        r2=pg.evaluate(JS_FOTO,[id,-0.55,0.85,a.w,a.h,a.fr-0.05,0.0])
        b1=webp(base64.b64decode(r1['url'].split(',')[1]),f'{pid}.webp'); b2=webp(base64.b64decode(r2['url'].split(',')[1]),f'{pid}_2.webp')
        fotos[pid]=(b1,b2); print(pid,'←',id,f'{len(b1)//1024} KB + {len(b2)//1024} KB')
    print('erros',errs[:3]); b.close()
def val(pid,k,bb):
    if a.pasta:
        (R/a.pasta).mkdir(parents=True,exist_ok=True); n=f'{pid}{"_2" if k else ""}.webp'; (R/a.pasta/n).write_bytes(bb); return f'{a.pasta}/{n}'
    return 'data:image/webp;base64,'+base64.b64encode(bb).decode()
onde = f"token = '{a.token}'" if a.token else "cliente_chave = 'TESTE'"
casos=[]
for pid,(b1,b2) in fotos.items():
    casos.append(f"when '{pid}' then p || jsonb_build_object('img','{val(pid,0,b1)}','img2','{val(pid,1,b2)}')")
sql=f"""-- Fotos 3D do portal ({len(fotos)} produtos) — gerado por portal/render_3d.py. NÃO subir para o GitHub se tiver token.
update public.portal_clientes set dados = jsonb_set(dados, '{{produtos}}', (
  select jsonb_agg(case p->>'pid' {' '.join(casos)} else p end order by o) from jsonb_array_elements(dados->'produtos') with ordinality as t(p,o)))
where {onde};
"""
(S/'fotos.sql').write_text(sql); print('SQL:', S/'fotos.sql', f'{len(sql)//1024} KB')
