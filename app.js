const APP_VERSION="1.5-pannelli-auto";
if("serviceWorker"in navigator){navigator.serviceWorker.register("service-worker.js?v=15").then(r=>r.update())}
const $=id=>document.getElementById(id);const photos=$("photos"),preview=$("preview");let lastText="",lastEstimate=null,editIndex=null;let selectedPanels=[];
document.querySelectorAll(".panel").forEach(p=>p.addEventListener("click",()=>{const name=p.dataset.panel;if(selectedPanels.includes(name)){selectedPanels=selectedPanels.filter(x=>x!==name);p.classList.remove("selected")}else{selectedPanels.push(name);p.classList.add("selected")}updateSelectedPanels()}));
function updateSelectedPanels(){$("selectedPanels").textContent="Pannelli selezionati: "+(selectedPanels.length?selectedPanels.join(", "):"nessuno")}
function setSelectedPanels(list){selectedPanels=list||[];document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("selected",selectedPanels.includes(p.dataset.panel)));updateSelectedPanels()}
photos.addEventListener("change",()=>{preview.innerHTML="";[...photos.files].slice(0,8).forEach(file=>{const img=document.createElement("img");img.src=URL.createObjectURL(file);preview.appendChild(img)})});
$("searchLeads").addEventListener("input",renderLeads);
$("finalPrice").addEventListener("input",()=>{if(!lastEstimate)return;lastEstimate.finalPrice=Number($("finalPrice").value||lastEstimate.suggestedPrice);lastEstimate.estimate=`${lastEstimate.finalPrice}€`;$("price").textContent=lastEstimate.estimate;lastText=buildText(lastEstimate);$("whatsapp").href="https://wa.me/?text="+encodeURIComponent(lastText)});
function getDentCount(){const v=Number($("dents").value);if(!v||v<1)return 1;return Math.round(v)}
function basePriceByDents(d){if(d<=50)return 350;if(d<=200)return 550;if(d<=300)return 750;if(d<=550)return 950;return 1150}
function panelMultiplier(){const n=selectedPanels.length;if(n<=1)return 1;if(n===2)return 1.15;if(n===3)return 1.25;if(n<=5)return 1.40;return 1.55}
function estimate(){const dents=getDentCount(),size=$("size").value,paint=$("paint").value;let base=basePriceByDents(dents);let notes=[];const pm=panelMultiplier();if(pm>1){base*=pm;notes.push(`${selectedPanels.length} pannelli: +${Math.round((pm-1)*100)}%`)}
if(selectedPanels.includes("Tetto")){base*=1.15;notes.push("Tetto: +15%")} if(selectedPanels.some(p=>p.includes("Fiancata"))){base*=1.10;notes.push("Fiancata: +10%")}
if(size==="media"){base*=1.10;notes.push("Bolli medi: +10%")} if(size==="grande"){base*=1.25;notes.push("Bolli grandi: +25%")} if(paint==="si"){notes.push("Vernice danneggiata: possibile carrozzeria")}
const suggested=Math.round(base/10)*10;let severity="lieve";if(dents>50)severity="medio";if(dents>200)severity="importante";if(dents>550)severity="molto importante";return{suggested,severity,dents,notes}}
function buildText(d){return`DentVision AI - Nuova richiesta
Cliente: ${d.name}
Telefono: ${d.phone}
Auto: ${d.carModel}
Targa/Rif.: ${d.plate}
Città: ${d.city}
Pannelli: ${d.panels}
Numero bolli: ${d.dents}
Grandezza: ${d.size}
Vernice danneggiata: ${d.paint}
Prezzo suggerito: ${d.suggestedPrice}€
Prezzo finale: ${d.finalPrice}€
Gravità: ${d.severity}
Note: ${d.notes||"Nessuna"}`}
$("estimateBtn").addEventListener("click",()=>{const e=estimate();const panelsText=selectedPanels.length?selectedPanels.join(", "):"Non indicati";const data={date:new Date().toLocaleString("it-IT"),carModel:$("carModel").value||"Auto non specificata",plate:$("plate").value||"N/D",city:$("city").value||"Città non specificata",panels:panelsText,panelsArray:[...selectedPanels],dentsValue:String(e.dents),dents:String(e.dents),size:$("size").value,paint:$("paint").value,name:$("name").value||"Cliente",phone:$("phone").value||"N/D",suggestedPrice:e.suggested,finalPrice:e.suggested,estimate:`${e.suggested}€`,severity:e.severity,notes:e.notes.join(", ")};lastEstimate=data;$("finalPrice").value=data.finalPrice;$("price").textContent=data.estimate;$("diagnosis").textContent=`Danno ${e.severity}. Bolli: ${e.dents}. Pannelli: ${panelsText}. Prezzo da listino: ${e.suggested}€. ${data.notes?"Note: "+data.notes:""}`;$("result").classList.remove("hidden");lastText=buildText(data);$("whatsapp").href="https://wa.me/?text="+encodeURIComponent(lastText);$("saveLead").textContent=editIndex!==null?"Aggiorna richiesta":"Salva richiesta"});
$("copyText").addEventListener("click",async()=>{if(!lastText)return;await navigator.clipboard.writeText(lastText);alert("Testo copiato.")});
$("saveLead").addEventListener("click",()=>{if(!lastEstimate)return;const leads=getLeads();if(editIndex!==null){leads[editIndex]=lastEstimate;editIndex=null;$("cancelEditBtn").classList.add("hidden");$("saveLead").textContent="Salva richiesta"}else{leads.unshift(lastEstimate)}setLeads(leads);renderLeads();alert("Richiesta salvata.")});
$("cancelEditBtn").addEventListener("click",()=>{editIndex=null;$("cancelEditBtn").classList.add("hidden");$("saveLead").textContent="Salva richiesta";clearForm()});
function getLeads(){return JSON.parse(localStorage.getItem("dentvision_leads")||"[]")}function setLeads(leads){localStorage.setItem("dentvision_leads",JSON.stringify(leads))}
function renderLeads(){const all=getLeads(),q=$("searchLeads").value.trim().toLowerCase();const filtered=all.map((lead,index)=>({lead,index})).filter(({lead})=>[lead.name,lead.phone,lead.plate,lead.carModel,lead.city,lead.panels].join(" ").toLowerCase().includes(q));$("leads").innerHTML=filtered.length?"":"<p class='hint'>Nessuna richiesta trovata.</p>";filtered.forEach(({lead,index})=>{const n=normalizeLead(lead);const div=document.createElement("div");div.className="lead";div.innerHTML=`<strong>${esc(n.name)}</strong> · ${esc(n.carModel)}<br>${esc(n.city)} · ${esc(n.estimate)} · ${esc(n.date)}<br><span class="small">Tel: ${esc(n.phone)} · Targa/Rif.: ${esc(n.plate||"N/D")} · Bolli: ${esc(n.dents||n.dentsValue||"N/D")} · Pannelli: ${esc(n.panels||"N/D")} · Danno: ${esc(n.severity)}</span><div class="lead-actions"><button onclick="editLead(${index})">Modifica</button><button class="danger" onclick="deleteLead(${index})">Elimina</button><a class="whatsapp" target="_blank" href="https://wa.me/?text=${encodeURIComponent(buildText(n))}">WhatsApp</a></div>`;$("leads").appendChild(div)})}
function normalizeLead(l){return{...l,suggestedPrice:l.suggestedPrice||l.finalPrice||l.estimate||"N/D",finalPrice:l.finalPrice||l.suggestedPrice||l.estimate||"N/D",notes:l.notes||"Nessuna",panels:l.panels||l.area||"Non indicati"}}
function editLead(index){const lead=getLeads()[index];if(!lead)return;editIndex=index;$("carModel").value=lead.carModel||"";$("plate").value=lead.plate||"";$("city").value=lead.city||"";$("dents").value=lead.dentsValue||lead.dents||"";$("size").value=lead.size||"piccola";$("paint").value=lead.paint||"no";$("name").value=lead.name||"";$("phone").value=lead.phone||"";setSelectedPanels(lead.panelsArray||[]);$("cancelEditBtn").classList.remove("hidden");$("estimateBtn").scrollIntoView({behavior:"smooth",block:"center"});alert("Dati caricati. Modifica, premi Genera stima e poi Aggiorna richiesta.")}
function deleteLead(index){if(!confirm("Vuoi davvero eliminare questa richiesta?"))return;const leads=getLeads();leads.splice(index,1);setLeads(leads);renderLeads()}
function clearForm(){["carModel","plate","city","name","phone","dents","finalPrice"].forEach(id=>$(id).value="");$("size").value="piccola";$("paint").value="no";setSelectedPanels([]);$("result").classList.add("hidden")}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
renderLeads();updateSelectedPanels();
