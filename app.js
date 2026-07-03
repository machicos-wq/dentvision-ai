const APP_VERSION="1.4-listino-professionale";
if("serviceWorker"in navigator){navigator.serviceWorker.register("service-worker.js?v=14").then(r=>r.update())}
const $=id=>document.getElementById(id);const photos=$("photos"),preview=$("preview");let lastText="",lastEstimate=null,editIndex=null;
photos.addEventListener("change",()=>{preview.innerHTML="";[...photos.files].slice(0,8).forEach(file=>{const img=document.createElement("img");img.src=URL.createObjectURL(file);preview.appendChild(img)})});
$("searchLeads").addEventListener("input",renderLeads);
$("finalPrice").addEventListener("input",()=>{if(!lastEstimate)return;lastEstimate.finalPrice=Number($("finalPrice").value||lastEstimate.suggestedPrice);lastEstimate.estimate=`${lastEstimate.finalPrice}€`;$("price").textContent=lastEstimate.estimate;lastText=buildText(lastEstimate);$("whatsapp").href="https://wa.me/?text="+encodeURIComponent(lastText)});
function getDentCount(){const v=Number($("dents").value);if(!v||v<1)return 1;return Math.round(v)}
function basePriceByDents(d){if(d<=50)return 350;if(d<=200)return 550;if(d<=300)return 750;if(d<=550)return 950;return 1150}
function estimate(){const dents=getDentCount(),area=$("area").value,size=$("size").value,paint=$("paint").value;let base=basePriceByDents(dents);let notes=[];
if(area==="tetto"){base*=1.15;notes.push("Tetto: +15%")} if(area==="fiancata"){base*=1.10;notes.push("Fiancata: +10%")} if(area==="multipla"){base*=1.25;notes.push("Più zone: +25%")}
if(size==="media"){base*=1.10;notes.push("Bolli medi: +10%")} if(size==="grande"){base*=1.25;notes.push("Bolli grandi: +25%")} if(paint==="si"){notes.push("Vernice danneggiata: possibile carrozzeria")}
const suggested=Math.round(base/10)*10;let severity="lieve";if(dents>50)severity="medio";if(dents>200)severity="importante";if(dents>550)severity="molto importante";return{suggested,severity,dents,notes}}
function buildText(d){return`DentVision AI - Nuova richiesta
Cliente: ${d.name}
Telefono: ${d.phone}
Auto: ${d.carModel}
Targa/Rif.: ${d.plate}
Città: ${d.city}
Zona: ${d.area}
Numero bolli: ${d.dents}
Grandezza: ${d.size}
Vernice danneggiata: ${d.paint}
Prezzo suggerito: ${d.suggestedPrice}€
Prezzo finale: ${d.finalPrice}€
Gravità: ${d.severity}
Note: ${d.notes||"Nessuna"}`}
$("estimateBtn").addEventListener("click",()=>{const e=estimate();const data={date:new Date().toLocaleString("it-IT"),carModel:$("carModel").value||"Auto non specificata",plate:$("plate").value||"N/D",city:$("city").value||"Città non specificata",area:$("area").value,dentsValue:String(e.dents),dents:String(e.dents),size:$("size").value,paint:$("paint").value,name:$("name").value||"Cliente",phone:$("phone").value||"N/D",suggestedPrice:e.suggested,finalPrice:e.suggested,estimate:`${e.suggested}€`,severity:e.severity,notes:e.notes.join(", ")};lastEstimate=data;$("finalPrice").value=data.finalPrice;$("price").textContent=data.estimate;$("diagnosis").textContent=`Danno ${e.severity}. Numero bolli: ${e.dents}. Prezzo da listino: ${e.suggested}€. ${data.notes?"Note: "+data.notes:""}`;$("result").classList.remove("hidden");lastText=buildText(data);$("whatsapp").href="https://wa.me/?text="+encodeURIComponent(lastText);$("saveLead").textContent=editIndex!==null?"Aggiorna richiesta":"Salva richiesta"});
$("copyText").addEventListener("click",async()=>{if(!lastText)return;await navigator.clipboard.writeText(lastText);alert("Testo copiato.")});
$("saveLead").addEventListener("click",()=>{if(!lastEstimate)return;const leads=getLeads();if(editIndex!==null){leads[editIndex]=lastEstimate;editIndex=null;$("cancelEditBtn").classList.add("hidden");$("saveLead").textContent="Salva richiesta"}else{leads.unshift(lastEstimate)}setLeads(leads);renderLeads();alert("Richiesta salvata.")});
$("cancelEditBtn").addEventListener("click",()=>{editIndex=null;$("cancelEditBtn").classList.add("hidden");$("saveLead").textContent="Salva richiesta";clearForm()});
function getLeads(){return JSON.parse(localStorage.getItem("dentvision_leads")||"[]")}function setLeads(leads){localStorage.setItem("dentvision_leads",JSON.stringify(leads))}
function renderLeads(){const all=getLeads(),q=$("searchLeads").value.trim().toLowerCase();const filtered=all.map((lead,index)=>({lead,index})).filter(({lead})=>[lead.name,lead.phone,lead.plate,lead.carModel,lead.city].join(" ").toLowerCase().includes(q));$("leads").innerHTML=filtered.length?"":"<p class='hint'>Nessuna richiesta trovata.</p>";filtered.forEach(({lead,index})=>{const n=normalizeLead(lead);const div=document.createElement("div");div.className="lead";div.innerHTML=`<strong>${esc(n.name)}</strong> · ${esc(n.carModel)}<br>${esc(n.city)} · ${esc(n.estimate)} · ${esc(n.date)}<br><span class="small">Tel: ${esc(n.phone)} · Targa/Rif.: ${esc(n.plate||"N/D")} · Bolli: ${esc(n.dents||n.dentsValue||"N/D")} · Danno: ${esc(n.severity)}</span><div class="lead-actions"><button onclick="editLead(${index})">Modifica</button><button class="danger" onclick="deleteLead(${index})">Elimina</button><a class="whatsapp" target="_blank" href="https://wa.me/?text=${encodeURIComponent(buildText(n))}">WhatsApp</a></div>`;$("leads").appendChild(div)})}
function normalizeLead(l){return{...l,suggestedPrice:l.suggestedPrice||l.finalPrice||l.estimate||"N/D",finalPrice:l.finalPrice||l.suggestedPrice||l.estimate||"N/D",notes:l.notes||"Nessuna"}}
function editLead(index){const lead=getLeads()[index];if(!lead)return;editIndex=index;$("carModel").value=lead.carModel||"";$("plate").value=lead.plate||"";$("city").value=lead.city||"";$("area").value=lead.area||"cofano";$("dents").value=lead.dentsValue||lead.dents||"";$("size").value=lead.size||"piccola";$("paint").value=lead.paint||"no";$("name").value=lead.name||"";$("phone").value=lead.phone||"";$("cancelEditBtn").classList.remove("hidden");$("estimateBtn").scrollIntoView({behavior:"smooth",block:"center"});alert("Dati caricati nel modulo. Modifica, premi Genera stima e poi Aggiorna richiesta.")}
function deleteLead(index){if(!confirm("Vuoi davvero eliminare questa richiesta?"))return;const leads=getLeads();leads.splice(index,1);setLeads(leads);renderLeads()}
function clearForm(){["carModel","plate","city","name","phone","dents","finalPrice"].forEach(id=>$(id).value="");$("area").value="cofano";$("size").value="piccola";$("paint").value="no";$("result").classList.add("hidden")}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
renderLeads();
