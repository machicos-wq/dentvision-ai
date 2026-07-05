// DentVision AI v1.7.1 - import map fix for Three.js / OrbitControls
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});

const $ = id => document.getElementById(id);
const KEY = "dentvision_leads";
let points = [], panels = [], editIndex = null, current = null, textToCopy = "", previewUrls = [];
let scene, camera, renderer, controls, raycaster, pointer, markerGroup, selectable = [], down, tween, activePointers = 0, multiTouch = false;

const getLeads = () => { try { const x = JSON.parse(localStorage.getItem(KEY)||"[]"); return Array.isArray(x)?x:[]; } catch { return []; } };
const saveLeads = x => localStorage.setItem(KEY, JSON.stringify(x));
const esc = x => String(x??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const norm = x => ({
  date:x?.date||"",carModel:x?.carModel||"Auto non specificata",plate:x?.plate||"N/D",city:x?.city||"Città non specificata",
  panels:x?.panels||"Non indicati",panelsArray:Array.isArray(x?.panelsArray)?x.panelsArray:[],
  damagePoints:Array.isArray(x?.damagePoints)?x.damagePoints:[],dents:String(x?.dents||x?.dentsValue||"N/D"),
  dentsValue:String(x?.dentsValue||x?.dents||""),size:x?.size||"piccola",paint:x?.paint||"no",
  name:x?.name||"Cliente",phone:x?.phone||"N/D",suggestedPrice:Number(x?.suggestedPrice||x?.finalPrice||0),
  finalPrice:Number(x?.finalPrice||x?.suggestedPrice||0),estimate:x?.estimate||`${x?.finalPrice||x?.suggestedPrice||"N/D"}€`,
  severity:x?.severity||"N/D",notes:x?.notes||"Nessuna"
});

function updateDamageUI(){
  panels = [...new Set(points.map(p=>p.panel).filter(Boolean))];
  $("pointCount").textContent = `${points.length} punt${points.length===1?"o":"i"} danno segnat${points.length===1?"o":"i"}`;
  $("panelSummary").textContent = `Pannelli: ${panels.length?panels.join(", "):"nessuno"}`;
  const list=$("damageList"); list.innerHTML="";
  if(!points.length){list.innerHTML="<p class='hint'>Nessun punto ancora. Ruota l’auto, fai zoom e tocca la zona danneggiata.</p>";return;}
  points.forEach((p,i)=>{
    const d=document.createElement("div");d.className="damage-item";
    d.innerHTML=`<div><strong>Punto ${i+1} · ${esc(p.panel)}</strong><span>${esc(p.zone||"Posizione salvata")}</span></div><button data-remove="${i}">Rimuovi</button>`;
    list.appendChild(d);
  });
}

function marker(p){
  if(!markerGroup)return;
  const m=new THREE.Mesh(new THREE.SphereGeometry(.13,20,16),new THREE.MeshStandardMaterial({color:0xef4444,emissive:0x6b0f19,emissiveIntensity:.7,roughness:.28}));
  m.position.set(p.position.x,p.position.y,p.position.z);m.castShadow=true;markerGroup.add(m);
  const r=new THREE.Mesh(new THREE.TorusGeometry(.18,.022,8,24),new THREE.MeshBasicMaterial({color:0xffc4c4}));
  r.position.copy(m.position);r.rotation.x=Math.PI/2;markerGroup.add(r);
}
function redrawMarkers(){if(!markerGroup)return;markerGroup.clear();points.forEach(marker)}
function addPoint(panel, pos){
  const h=pos.x<-.3?"lato SX":pos.x>.3?"lato DX":"centro";
  const z=pos.z<-.6?"zona anteriore":pos.z>.6?"zona posteriore":"zona centrale";
  const p={id:`${Date.now()}${Math.random()}`,panel,position:{x:+pos.x.toFixed(3),y:+pos.y.toFixed(3),z:+pos.z.toFixed(3)},zone:`${panel} · ${h}, ${z}`};
  points.push(p);marker(p);updateDamageUI();
}

/* 3D */
function nonBox(parent,size,pos,color,opacity=1){
  const m=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),new THREE.MeshStandardMaterial({color,metalness:.35,roughness:.38,transparent:opacity<1,opacity}));
  m.position.copy(pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function panelBox(parent,panel,size,pos,color){
  const m=nonBox(parent,size,pos,color);m.userData.panel=panel;selectable.push(m);return m;
}
function wheel(parent,x,z){
  const w=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,.28,24),new THREE.MeshStandardMaterial({color:0x111827,roughness:.7}));
  w.position.set(x,.46,z);w.rotation.z=Math.PI/2;w.castShadow=true;parent.add(w);
  const r=new THREE.Mesh(new THREE.CylinderGeometry(.21,.21,.3,20),new THREE.MeshStandardMaterial({color:0xcbd5e1,metalness:.8,roughness:.2}));
  r.position.copy(w.position);r.rotation.z=Math.PI/2;parent.add(r);
}
function makeCar(){
  const car=new THREE.Group();scene.add(car);
  nonBox(car,{x:2.05,y:.72,z:4.48},new THREE.Vector3(0,.92,0),0x0b4e70);
  panelBox(car,"Cofano",{x:1.84,y:.18,z:1.32},new THREE.Vector3(0,1.44,-1.48),0x1675a1);
  panelBox(car,"Tetto",{x:1.65,y:.18,z:1.92},new THREE.Vector3(0,2.08,.10),0x145f86);
  panelBox(car,"Baule",{x:1.84,y:.18,z:1.10},new THREE.Vector3(0,1.42,1.72),0x1675a1);
  panelBox(car,"Fiancata sinistra",{x:.16,y:.70,z:2.58},new THREE.Vector3(-1.10,1.16,.05),0x12638d);
  panelBox(car,"Fiancata destra",{x:.16,y:.70,z:2.58},new THREE.Vector3(1.10,1.16,.05),0x12638d);
  panelBox(car,"Parafango anteriore sinistro",{x:.18,y:.62,z:.62},new THREE.Vector3(-1.12,1.18,-1.80),0x1681ad);
  panelBox(car,"Parafango anteriore destro",{x:.18,y:.62,z:.62},new THREE.Vector3(1.12,1.18,-1.80),0x1681ad);
  panelBox(car,"Parafango posteriore sinistro",{x:.18,y:.62,z:.62},new THREE.Vector3(-1.12,1.18,1.80),0x1681ad);
  panelBox(car,"Parafango posteriore destro",{x:.18,y:.62,z:.62},new THREE.Vector3(1.12,1.18,1.80),0x1681ad);
  nonBox(car,{x:1.55,y:.76,z:1.80},new THREE.Vector3(0,1.76,.12),0x091824);
  nonBox(car,{x:1.42,y:.56,z:.78},new THREE.Vector3(0,1.94,-.38),0x71c8ec,.58);
  nonBox(car,{x:1.42,y:.56,z:.72},new THREE.Vector3(0,1.94,.60),0x71c8ec,.58);
  nonBox(car,{x:.44,y:.18,z:.08},new THREE.Vector3(-.57,1.09,-2.26),0xeef6ff);
  nonBox(car,{x:.44,y:.18,z:.08},new THREE.Vector3(.57,1.09,-2.26),0xeef6ff);
  nonBox(car,{x:.42,y:.18,z:.08},new THREE.Vector3(-.57,1.09,2.26),0xef4444);
  nonBox(car,{x:.42,y:.18,z:.08},new THREE.Vector3(.57,1.09,2.26),0xef4444);
  [[-1.12,-1.52],[1.12,-1.52],[-1.12,1.52],[1.12,1.52]].forEach(a=>wheel(car,...a));
  const g=new THREE.Mesh(new THREE.CircleGeometry(5.2,48),new THREE.MeshBasicMaterial({color:0x05111d,transparent:true,opacity:.72}));
  g.rotation.x=-Math.PI/2;g.position.y=.02;scene.add(g);
}
function resize3d(){
  const c=$("viewer3d");if(!renderer||!c.clientWidth||!c.clientHeight)return;
  camera.aspect=c.clientWidth/c.clientHeight;camera.updateProjectionMatrix();renderer.setSize(c.clientWidth,c.clientHeight,false);
}
function animate(){
  requestAnimationFrame(animate);controls?.update();
  if(tween){const t=Math.min(1,(performance.now()-tween.start)/420),e=1-Math.pow(1-t,3);camera.position.lerpVectors(tween.from,tween.to,e);controls.target.lerpVectors(tween.tf,tween.tt,e);if(t>=1)tween=null;}
  renderer?.render(scene,camera);
}
function view(name){
  const p={front:[0,2.4,-9.1],rear:[0,2.4,9.1],left:[-9.1,2.5,0],right:[9.1,2.5,0],top:[0,10.5,0],reset:[7.1,4.6,7.5]}[name];
  tween={from:camera.position.clone(),to:new THREE.Vector3(...p),tf:controls.target.clone(),tt:new THREE.Vector3(0, name === "top" ? .9 : 1.18, 0),start:performance.now()};
}
function init3d(){
  const box=$("viewer3d");scene=new THREE.Scene();scene.fog=new THREE.Fog(0x07111f,8,18);
  camera=new THREE.PerspectiveCamera(38,box.clientWidth/box.clientHeight,.1,100);camera.position.set(7.1,4.6,7.5);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;box.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,1.18,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=4.7;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=Math.PI*.16;controls.update();
  raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();markerGroup=new THREE.Group();scene.add(markerGroup);
  scene.add(new THREE.HemisphereLight(0x8edcff,0x07111f,2.2));
  const l=new THREE.DirectionalLight(0xffffff,2.3);l.position.set(4,7,4);l.castShadow=true;l.shadow.mapSize.set(1024,1024);scene.add(l);
  const r=new THREE.DirectionalLight(0x38bdf8,1.2);r.position.set(-5,3,-4);scene.add(r);
  makeCar();redrawMarkers();resize3d();animate();
  renderer.domElement.addEventListener("pointerdown",e=>{activePointers+=1;if(activePointers>1)multiTouch=true;if(activePointers===1)down={x:e.clientX,y:e.clientY,t:performance.now()}},{passive:true});
  renderer.domElement.addEventListener("pointerup",e=>{
    const wasMulti=multiTouch;activePointers=Math.max(0,activePointers-1);if(activePointers===0)multiTouch=false;
    if(!down||wasMulti){down=null;return}
    const d=Math.hypot(e.clientX-down.x,e.clientY-down.y),time=performance.now()-down.t;down=null;if(d>10||time>420)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.x=(e.clientX-rect.left)/rect.width*2-1;pointer.y=-(e.clientY-rect.top)/rect.height*2+1;raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(selectable,false)[0];if(hit)addPoint(hit.object.userData.panel,hit.point);
  },{passive:true});
  renderer.domElement.addEventListener("pointercancel",()=>{activePointers=0;multiTouch=false;down=null},{passive:true});
  $("threeStatus").textContent="3D pronto";$("threeStatus").className="pill ok";
}

/* Foto */
function clearPreview(){previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];$("preview").innerHTML=""}

/* Preventivo */
function base(n){return n<=50?350:n<=200?550:n<=300?750:n<=550?950:1150}
function makeEstimate(){
  const dents=Math.max(1,Math.round(Number($("dents").value)||1));let price=base(dents),notes=[];
  if(panels.length===2){price*=1.15;notes.push("2 pannelli: +15%")}else if(panels.length===3){price*=1.25;notes.push("3 pannelli: +25%")}else if(panels.length>=4){price*=1.40;notes.push("4+ pannelli: +40%")}
  if(panels.includes("Tetto")){price*=1.15;notes.push("Tetto: +15%")}
  if(panels.some(x=>x.startsWith("Fiancata"))){price*=1.10;notes.push("Fiancata: +10%")}
  if($("size").value==="media"){price*=1.10;notes.push("Bolli medi: +10%")}else if($("size").value==="grande"){price*=1.25;notes.push("Bolli grandi: +25%")}
  if($("paint").value==="si")notes.push("Vernice danneggiata: valutare carrozzeria");
  const severity=dents>550?"molto importante":dents>200?"importante":dents>50?"medio":"lieve";
  return {dents,price:Math.round(price/10)*10,severity,notes};
}
function message(d){return `DentVision AI - Nuova richiesta
Cliente: ${d.name}
Telefono: ${d.phone}
Auto: ${d.carModel}
Targa/Rif.: ${d.plate}
Città: ${d.city}
Pannelli: ${d.panels}
Punti danno 3D: ${d.damagePoints.length}
Numero bolli: ${d.dents}
Grandezza: ${d.size}
Vernice danneggiata: ${d.paint}
Prezzo suggerito: ${d.suggestedPrice}€
Prezzo finale: ${d.finalPrice}€
Gravità: ${d.severity}
Note: ${d.notes}`}

function renderLeads(){
  const q=$("search").value.trim().toLowerCase(), box=$("leads");box.innerHTML="";
  const list=getLeads().map((x,i)=>({x:norm(x),i})).filter(({x})=>[x.name,x.phone,x.plate,x.carModel,x.city,x.panels].join(" ").toLowerCase().includes(q));
  if(!list.length){box.innerHTML="<p class='hint'>Nessuna richiesta trovata.</p>";return;}
  list.forEach(({x,i})=>{const d=document.createElement("div");d.className="lead";d.innerHTML=`<strong>${esc(x.name)}</strong> · ${esc(x.carModel)}<br>${esc(x.city)} · ${esc(x.estimate)} · ${esc(x.date)}<br><span class="small">Tel: ${esc(x.phone)} · Targa: ${esc(x.plate)} · Bolli: ${esc(x.dents)} · Pannelli: ${esc(x.panels)} · Punti 3D: ${x.damagePoints.length}</span><div class="lead-actions"><button data-action="edit" data-index="${i}">Modifica</button><button class="danger" data-action="delete" data-index="${i}">Elimina</button><a class="whatsapp" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(message(x))}">WhatsApp</a></div>`;box.appendChild(d)});
}
function reset(){
  ["carModel","plate","city","dents","name","phone","finalPrice"].forEach(id=>$(id).value="");$("size").value="piccola";$("paint").value="no";$("photos").value="";clearPreview();$("result").classList.add("hidden");$("cancelEdit").classList.add("hidden");$("saveLead").textContent="Salva richiesta";
  points=[];panels=[];redrawMarkers();updateDamageUI();editIndex=null;current=null;textToCopy="";
}
function load(i){
  const x=norm(getLeads()[i]);editIndex=i;$("carModel").value=x.carModel==="Auto non specificata"?"":x.carModel;$("plate").value=x.plate==="N/D"?"":x.plate;$("city").value=x.city==="Città non specificata"?"":x.city;$("dents").value=x.dentsValue;$("size").value=x.size;$("paint").value=x.paint;$("name").value=x.name==="Cliente"?"":x.name;$("phone").value=x.phone==="N/D"?"":x.phone;points=x.damagePoints;panels=x.panelsArray.length?x.panelsArray:[...new Set(points.map(p=>p.panel))];redrawMarkers();updateDamageUI();$("cancelEdit").classList.remove("hidden");$("estimateBtn").scrollIntoView({behavior:"smooth",block:"center"});alert("Dati caricati. Modifica, genera la stima e poi aggiorna la richiesta.");
}
async function copy(txt){try{await navigator.clipboard.writeText(txt)}catch{const a=document.createElement("textarea");a.value=txt;a.style.position="fixed";a.style.opacity=0;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove()}}

function bind(){
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>view(b.dataset.view)));
  $("undoPoint").addEventListener("click",()=>{if(points.length){points.pop();redrawMarkers();updateDamageUI()}});
  $("clearPoints").addEventListener("click",()=>{if(points.length&&confirm("Vuoi cancellare tutti i punti danno?")){points=[];panels=[];redrawMarkers();updateDamageUI()}});
  $("damageList").addEventListener("click",e=>{const b=e.target.closest("[data-remove]");if(!b)return;points.splice(Number(b.dataset.remove),1);redrawMarkers();updateDamageUI()});
  $("photos").addEventListener("change",()=>{clearPreview();[...$("photos").files].slice(0,8).forEach(f=>{const img=document.createElement("img"),u=URL.createObjectURL(f);previewUrls.push(u);img.src=u;img.alt="Foto veicolo";$("preview").appendChild(img)})});
  $("estimateBtn").addEventListener("click",()=>{
    const e=makeEstimate(),p=panels.length?panels.join(", "):"Non indicati";
    current={date:new Date().toLocaleString("it-IT"),carModel:$("carModel").value.trim()||"Auto non specificata",plate:$("plate").value.trim()||"N/D",city:$("city").value.trim()||"Città non specificata",panels:p,panelsArray:[...panels],damagePoints:points.map(x=>({...x,position:{...x.position}})),dents:String(e.dents),dentsValue:String(e.dents),size:$("size").value,paint:$("paint").value,name:$("name").value.trim()||"Cliente",phone:$("phone").value.trim()||"N/D",suggestedPrice:e.price,finalPrice:e.price,estimate:`${e.price}€`,severity:e.severity,notes:e.notes.join(", ")||"Nessuna"};
    $("price").textContent=`${e.price}€`;$("finalPrice").value=e.price;$("diagnosis").textContent=`Danno ${e.severity}. Bolli: ${e.dents}. Pannelli: ${p}. Punti 3D segnati: ${points.length}. ${current.notes!=="Nessuna"?"Note: "+current.notes:""}`;$("result").classList.remove("hidden");$("saveLead").textContent=editIndex===null?"Salva richiesta":"Aggiorna richiesta";textToCopy=message(current);$("whatsapp").href=`https://wa.me/?text=${encodeURIComponent(textToCopy)}`;
  });
  $("finalPrice").addEventListener("input",()=>{if(!current)return;const v=Number($("finalPrice").value);if(!Number.isFinite(v)||v<0)return;current.finalPrice=v;current.estimate=`${v}€`;$("price").textContent=`${v}€`;textToCopy=message(current);$("whatsapp").href=`https://wa.me/?text=${encodeURIComponent(textToCopy)}`});
  $("saveLead").addEventListener("click",()=>{if(!current){alert("Prima genera una stima.");return}const l=getLeads();if(editIndex===null)l.unshift(current);else l[editIndex]=current;saveLeads(l);alert(editIndex===null?"Richiesta salvata.":"Richiesta aggiornata.");renderLeads();reset()});
  $("copyText").addEventListener("click",async()=>{if(!textToCopy)return;await copy(textToCopy);alert("Testo copiato.")});
  $("cancelEdit").addEventListener("click",reset);$("search").addEventListener("input",renderLeads);
  $("leads").addEventListener("click",e=>{const b=e.target.closest("[data-action]");if(!b)return;const i=Number(b.dataset.index);if(b.dataset.action==="edit")load(i);else if(b.dataset.action==="delete"&&confirm("Vuoi davvero eliminare questa richiesta?")){const l=getLeads();l.splice(i,1);saveLeads(l);renderLeads()}});
  window.addEventListener("resize",resize3d);
}
bind();updateDamageUI();renderLeads();
try{init3d()}catch(e){console.error(e);$("threeStatus").textContent="3D non disponibile";$("threeStatus").className="pill fail";$("viewer3d").innerHTML="<p class='hint' style='padding:16px'>Il motore 3D non si è avviato. Controlla la connessione e riapri la pagina.</p>"}