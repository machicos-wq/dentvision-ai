// DentVision AI v1.8.1
// Il modello GLB è locale. Ogni tocco crea un hotspot visibile e apre una scheda con quantità e note.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const STORE = "dentvision_leads";
  const viewer = $("car3d");
  const dialog = $("damageDialog");
  let damagePoints = [];
  let selectedPanels = [];
  let selectedPhotoFiles = [];
  let previewUrls = [];
  let latestEstimate = null;
  let editIndex = null;
  let modelReady = false;
  let press = null;
  let editingPointIndex = null;
  let creatingPointIndex = null;

  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const getLeads = () => { try { const data = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(data) ? data : []; } catch { return []; } };
  const putLeads = (leads) => localStorage.setItem(STORE, JSON.stringify(leads));
  const normalizePoint = (point = {}) => ({
    id: point.id || `old-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    surface: point.surface || "",
    position: point.position || "",
    normal: point.normal || "",
    panel: point.panel || "Da definire",
    zone: point.zone || "Punto preciso salvato sul modello",
    dents: Math.max(1, Number(point.dents) || 1),
    size: ["piccola", "media", "grande"].includes(point.size) ? point.size : "piccola",
    depth: ["lieve", "media", "forte"].includes(point.depth) ? point.depth : "lieve",
    paint: point.paint === "si" ? "si" : "no",
    note: String(point.note || "")
  });

  function setModelStatus(text, type = "warning") {
    const badge = $("threeStatus");
    badge.textContent = text;
    badge.className = `status-pill ${type}`;
  }

  function totalPointDents() {
    return damagePoints.reduce((sum, point) => sum + Math.max(1, Number(point.dents) || 1), 0);
  }

  function refreshPanelSummary() {
    selectedPanels = [...new Set(damagePoints.map(point => point.panel).filter(panel => panel && panel !== "Da definire"))];
    const n = damagePoints.length;
    const total = totalPointDents();
    $("pointCount").textContent = `${n} punt${n === 1 ? "o" : "i"} danno segnat${n === 1 ? "o" : "i"} · ${total} boll${total === 1 ? "o" : "i"} indicat${total === 1 ? "o" : "i"}`;
    $("panelSummary").textContent = `Pannelli: ${selectedPanels.length ? selectedPanels.join(", ") : "da definire"}`;
    const list = $("damageList");
    list.innerHTML = "";
    if (!n) {
      list.innerHTML = "<p class='hint'>Nessun punto ancora. Ruota l’auto, fai zoom e tocca la carrozzeria: si aprirà subito la scheda con note e quantità.</p>";
      return;
    }
    damagePoints.forEach((point, index) => {
      const row = document.createElement("div");
      row.className = "damage-item detail-item";
      const paintText = point.paint === "si" ? "Vernice danneggiata" : "Vernice integra";
      row.innerHTML = `<div class="damage-copy"><strong>Punto ${index + 1} · ${esc(point.panel)}</strong><span>${esc(point.dents)} boll${Number(point.dents) === 1 ? "o" : "i"} ${esc(point.size)} · profondità ${esc(point.depth)} · ${paintText}</span>${point.note ? `<em>Nota: ${esc(point.note)}</em>` : "<em class='missing-note'>Nessuna nota</em>"}</div><div class="damage-row-actions"><button type="button" data-edit-point="${index}">Modifica</button><button type="button" data-remove-point="${index}" class="danger-mini">Rimuovi</button></div>`;
      list.appendChild(row);
    });
  }

  function clearMarkersOnModel() {
    viewer.querySelectorAll(".damage-marker").forEach(marker => marker.remove());
  }

  function markerTitle(point, number) {
    return `Punto ${number}: ${point.panel} · ${point.dents} bolli ${point.size}${point.note ? ` · ${point.note}` : ""}`;
  }

  function buildMarker(point, number) {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "damage-marker";
    marker.slot = `hotspot-${point.id}`;
    marker.dataset.pointId = point.id;
    marker.title = markerTitle(point, number);
    marker.setAttribute("aria-label", marker.title);
    marker.textContent = String(number);
    marker.setAttribute("data-visibility-attribute", "visible");

    // Position and normal force a stable, visible hotspot for this static model.
    if (point.position && point.normal) {
      marker.setAttribute("data-position", point.position);
      marker.setAttribute("data-normal", point.normal);
    } else if (point.surface) {
      marker.setAttribute("data-surface", point.surface);
    } else {
      return;
    }

    marker.addEventListener("pointerdown", event => event.stopPropagation());
    marker.addEventListener("click", event => {
      event.stopPropagation();
      const index = damagePoints.findIndex(item => item.id === point.id);
      if (index >= 0) openPointEditor(index, false);
    });
    viewer.appendChild(marker);
  }

  function restoreMarkers() {
    clearMarkersOnModel();
    if (modelReady) damagePoints.forEach((point, index) => buildMarker(point, index + 1));
  }

  function addDamagePoint(hit) {
    const point = normalizePoint({
      id: `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      surface: hit.surface,
      position: hit.position,
      normal: hit.normal,
      panel: "Da definire",
      zone: "Punto preciso segnato sul modello",
      dents: 1,
      size: "piccola",
      depth: "lieve",
      paint: "no",
      note: ""
    });
    damagePoints.push(point);
    restoreMarkers();
    refreshPanelSummary();
    openPointEditor(damagePoints.length - 1, true);
  }

  function openPointEditor(index, isNew) {
    const point = damagePoints[index];
    if (!point) return;
    editingPointIndex = index;
    creatingPointIndex = isNew ? index : null;
    $("damageDialogTitle").textContent = `Punto ${index + 1} · dettagli danno`;
    $("pointPanel").value = point.panel || "Da definire";
    $("pointDents").value = Math.max(1, Number(point.dents) || 1);
    $("pointSize").value = point.size || "piccola";
    $("pointDepth").value = point.depth || "lieve";
    $("pointPaint").value = point.paint === "si" ? "si" : "no";
    $("pointNote").value = point.note || "";
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  function closePointEditor(discardNew = false) {
    if (discardNew && creatingPointIndex !== null && damagePoints[creatingPointIndex]) {
      damagePoints.splice(creatingPointIndex, 1);
      restoreMarkers();
      refreshPanelSummary();
    }
    editingPointIndex = null;
    creatingPointIndex = null;
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function savePointEditor() {
    if (editingPointIndex === null || !damagePoints[editingPointIndex]) return;
    const point = damagePoints[editingPointIndex];
    point.panel = $("pointPanel").value;
    point.dents = Math.max(1, Math.round(Number($("pointDents").value) || 1));
    point.size = $("pointSize").value;
    point.depth = $("pointDepth").value;
    point.paint = $("pointPaint").value;
    point.note = $("pointNote").value.trim().slice(0, 500);
    point.zone = `${point.panel} · ${point.dents} boll${point.dents === 1 ? "o" : "i"} ${point.size}`;
    restoreMarkers();
    refreshPanelSummary();
    closePointEditor(false);
  }

  async function activateModel() {
    try {
      await customElements.whenDefined("model-viewer");
      viewer.addEventListener("load", () => {
        modelReady = true;
        $("modelFallback").classList.add("hidden");
        setModelStatus("Modello 3D pronto", "ok");
        restoreMarkers();
      }, { once: true });
      viewer.addEventListener("error", () => {
        setModelStatus("Modello non caricato", "fail");
        $("modelFallback").textContent = "Il modello 3D non si è caricato. Riapri la pagina con internet attivo.";
      });
      if (viewer.loaded) {
        modelReady = true;
        $("modelFallback").classList.add("hidden");
        setModelStatus("Modello 3D pronto", "ok");
        restoreMarkers();
      }
    } catch {
      setModelStatus("Motore 3D non disponibile", "fail");
      $("modelFallback").textContent = "Il motore 3D non è disponibile. Controlla la connessione e riapri la pagina.";
    }
  }

  window.addEventListener("dentvision-model-viewer-ready", activateModel);
  window.addEventListener("dentvision-model-viewer-failed", () => {
    setModelStatus("Motore 3D non disponibile", "fail");
    $("modelFallback").textContent = "Il motore 3D non si è caricato. Controlla la connessione e riapri.";
  });
  if (customElements.get("model-viewer")) activateModel();
  setTimeout(() => {
    if (!modelReady && !customElements.get("model-viewer")) setModelStatus("Motore 3D in attesa", "warning");
  }, 9000);

  viewer.addEventListener("pointerdown", event => {
    if (event.target.closest?.(".damage-marker")) return;
    press = { x: event.clientX, y: event.clientY, time: performance.now() };
  }, { passive: true });

  viewer.addEventListener("pointerup", event => {
    if (!press || !modelReady) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    const duration = performance.now() - press.time;
    press = null;
    if (moved > 10 || duration > 420 || dialog.open) return;
    try {
      const picked = viewer.positionAndNormalFromPoint?.(event.clientX, event.clientY);
      const surface = viewer.surfaceFromPoint?.(event.clientX, event.clientY);
      if (!picked && !surface) return;
      addDamagePoint({
        surface: surface ? String(surface) : "",
        position: picked?.position?.toString?.() || "",
        normal: picked?.normal?.toString?.() || ""
      });
    } catch (error) {
      console.warn("Punto danno non letto", error);
    }
  }, { passive: true });

  const cameraViews = { front: "0deg 76deg 105%", rear: "180deg 76deg 105%", left: "-90deg 76deg 105%", right: "90deg 76deg 105%", top: "0deg 8deg 120%", reset: "-35deg 68deg 105%" };
  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => { if (modelReady) viewer.cameraOrbit = cameraViews[button.dataset.view] || cameraViews.reset; });
  });

  function clearSelectedPhotos() {
    previewUrls.forEach(URL.revokeObjectURL); previewUrls = []; selectedPhotoFiles = [];
    $("preview").innerHTML = ""; $("photoHint").textContent = "Nessuna foto selezionata.";
  }

  function renderSelectedPhotos() {
    previewUrls.forEach(URL.revokeObjectURL); previewUrls = []; $("preview").innerHTML = "";
    selectedPhotoFiles.forEach((file, index) => {
      const tile = document.createElement("div"); tile.className = "photo-tile";
      const image = document.createElement("img"); const url = URL.createObjectURL(file); previewUrls.push(url);
      image.src = url; image.alt = `Foto danno ${index + 1}`;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-photo"; remove.dataset.removePhoto = String(index); remove.textContent = "×";
      tile.append(image, remove); $("preview").appendChild(tile);
    });
    $("photoHint").textContent = selectedPhotoFiles.length ? `${selectedPhotoFiles.length} foto selezionata${selectedPhotoFiles.length === 1 ? "" : "e"}.` : "Nessuna foto selezionata.";
  }

  function addSelectedPhotos(files) {
    [...(files || [])].filter(file => file?.type?.startsWith("image/")).forEach(file => {
      const duplicate = selectedPhotoFiles.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified);
      if (!duplicate && selectedPhotoFiles.length < 8) selectedPhotoFiles.push(file);
    });
    renderSelectedPhotos(); $("photoCheck").className = "photo-check hidden";
  }

  function photoImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile")); };
      img.src = url;
    });
  }

  async function checkPhotos() {
    const files = selectedPhotoFiles.slice(0, 6);
    if (!files.length) { alert("Prima scegli almeno una foto."); return; }
    let weak = 0, low = 0;
    for (const file of files) {
      try {
        const image = await photoImage(file);
        if (image.naturalWidth < 900 || image.naturalHeight < 600) low++;
        const canvas = document.createElement("canvas"); const w = Math.min(150, image.naturalWidth), h = Math.max(1, Math.round(image.naturalHeight * w / image.naturalWidth));
        canvas.width = w; canvas.height = h;
        const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0, w, h);
        const pixels = context.getImageData(0, 0, w, h).data; let sum = 0, sumSq = 0;
        for (let i = 0; i < pixels.length; i += 4) { const b = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]; sum += b; sumSq += b * b; }
        const count = pixels.length / 4, mean = sum / count, contrast = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
        if (mean < 55 || mean > 205 || contrast < 20) weak++;
      } catch { weak++; }
    }
    const score = Math.max(0, 100 - (files.length < 3 ? 30 : 0) - weak * 18 - low * 10);
    const issues = []; if (files.length < 3) issues.push("servono almeno 3 foto"); if (weak) issues.push(`${weak} foto con luce o contrasto debole`); if (low) issues.push(`${low} foto poco definite`);
    const box = $("photoCheck"); box.className = `photo-check ${score >= 70 ? "good" : "warning"}`;
    box.innerHTML = `<strong>Controllo foto: ${score}/100</strong><br><span class="small">${issues.length ? issues.join(" · ") : "Qualità tecnica buona. Per contare davvero i bolli collegheremo poi l’IA online."}</span>`;
  }

  function basePrice(dents) { if (dents <= 50) return 350; if (dents <= 200) return 550; if (dents <= 300) return 750; if (dents <= 550) return 950; return 1150; }
  function makeEstimate() {
    const typed = Math.round(Number($("dents").value) || 0);
    const dents = Math.max(1, typed || totalPointDents() || 1);
    let price = basePrice(dents); const notes = [];
    if (selectedPanels.length === 2) { price *= 1.15; notes.push("2 pannelli: +15%"); }
    else if (selectedPanels.length === 3) { price *= 1.25; notes.push("3 pannelli: +25%"); }
    else if (selectedPanels.length >= 4) { price *= 1.40; notes.push("4+ pannelli: +40%"); }
    if (selectedPanels.includes("Tetto")) { price *= 1.15; notes.push("Tetto: +15%"); }
    if (selectedPanels.includes("Fiancata sinistra") || selectedPanels.includes("Fiancata destra")) { price *= 1.10; notes.push("Fiancata: +10%"); }
    if ($("size").value === "media") { price *= 1.10; notes.push("Bolli medi: +10%"); }
    if ($("size").value === "grande") { price *= 1.25; notes.push("Bolli grandi: +25%"); }
    if ($("paint").value === "si") notes.push("Vernice danneggiata: valutare carrozzeria");
    const severity = dents > 550 ? "molto importante" : dents > 200 ? "importante" : dents > 50 ? "medio" : "lieve";
    return { dents, price: Math.round(price / 10) * 10, severity, notes };
  }

  function pointDetailsText(points = []) {
    if (!points.length) return "Nessun punto 3D dettagliato.";
    return points.map((point, index) => {
      const p = normalizePoint(point);
      return `${index + 1}. ${p.panel}: ${p.dents} boll${p.dents === 1 ? "o" : "i"} ${p.size}, profondità ${p.depth}, vernice ${p.paint === "si" ? "danneggiata" : "integra"}${p.note ? `, nota: ${p.note}` : ""}`;
    }).join("\n");
  }

  function buildMessage(data) {
    return `DentVision AI - Nuova richiesta\nCliente: ${data.name}\nTelefono: ${data.phone}\nAuto: ${data.carModel}\nTarga/Rif.: ${data.plate}\nCittà: ${data.city}\nPunti danno 3D: ${data.damagePoints.length}\nDettaglio punti:\n${pointDetailsText(data.damagePoints)}\nNumero bolli totale: ${data.dents}\nGrandezza media: ${data.size}\nVernice danneggiata: ${data.paint}\nPrezzo suggerito: ${data.suggestedPrice}€\nPrezzo finale: ${data.finalPrice}€\nGravità: ${data.severity}\nNote preventivo: ${data.notes}`;
  }

  function renderLeads() {
    const query = $("search").value.trim().toLowerCase(); const holder = $("leads"); holder.innerHTML = "";
    const matches = getLeads().map((lead, index) => ({ lead, index })).filter(({ lead }) => [lead.name, lead.phone, lead.plate, lead.carModel, lead.city, lead.panels, pointDetailsText(lead.damagePoints || [])].join(" ").toLowerCase().includes(query));
    if (!matches.length) { holder.innerHTML = "<p class='hint'>Nessuna richiesta trovata.</p>"; return; }
    matches.forEach(({ lead, index }) => {
      const row = document.createElement("div"); row.className = "lead";
      row.innerHTML = `<strong>${esc(lead.name)}</strong> · ${esc(lead.carModel)}<br>${esc(lead.city)} · ${esc(lead.estimate)} · ${esc(lead.date)}<br><span class="small">Tel: ${esc(lead.phone)} · Targa/Rif.: ${esc(lead.plate)} · Bolli: ${esc(lead.dents)} · Punti 3D: ${(lead.damagePoints || []).length}</span><div class="lead-actions"><button type="button" data-edit="${index}">Modifica</button><button type="button" class="danger" data-delete="${index}">Elimina</button><a class="whatsapp" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(buildMessage(lead))}">WhatsApp</a></div>`;
      holder.appendChild(row);
    });
  }

  function resetForm() {
    ["carModel", "plate", "city", "dents", "name", "phone", "finalPrice"].forEach(id => $(id).value = "");
    $("size").value = "piccola"; $("paint").value = "no"; $("galleryPhotos").value = ""; $("cameraPhotos").value = ""; clearSelectedPhotos();
    $("photoCheck").className = "photo-check hidden"; $("result").classList.add("hidden"); $("cancelEdit").classList.add("hidden"); $("saveLead").textContent = "Salva richiesta";
    damagePoints = []; selectedPanels = []; restoreMarkers(); refreshPanelSummary(); latestEstimate = null; editIndex = null; closePointEditor(false);
  }

  function loadEdit(index) {
    const lead = getLeads()[index]; if (!lead) return; editIndex = index;
    $("carModel").value = lead.carModel === "Auto non specificata" ? "" : lead.carModel;
    $("plate").value = lead.plate === "N/D" ? "" : lead.plate;
    $("city").value = lead.city === "Città non specificata" ? "" : lead.city;
    $("dents").value = lead.dentsValue || lead.dents || ""; $("size").value = lead.size || "piccola"; $("paint").value = lead.paint || "no";
    $("name").value = lead.name === "Cliente" ? "" : lead.name; $("phone").value = lead.phone === "N/D" ? "" : lead.phone;
    damagePoints = Array.isArray(lead.damagePoints) ? lead.damagePoints.map(normalizePoint) : [];
    restoreMarkers(); refreshPanelSummary(); $("cancelEdit").classList.remove("hidden"); $("estimateBtn").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function bindEvents() {
    $("undoPoint").addEventListener("click", () => { if (damagePoints.length) { damagePoints.pop(); restoreMarkers(); refreshPanelSummary(); } });
    $("clearPoints").addEventListener("click", () => { if (damagePoints.length && confirm("Vuoi cancellare tutti i punti danno?")) { damagePoints = []; restoreMarkers(); refreshPanelSummary(); } });
    $("damageList").addEventListener("click", event => {
      const remove = event.target.closest("[data-remove-point]"); const edit = event.target.closest("[data-edit-point]");
      if (remove) { damagePoints.splice(Number(remove.dataset.removePoint), 1); restoreMarkers(); refreshPanelSummary(); }
      if (edit) openPointEditor(Number(edit.dataset.editPoint), false);
    });
    $("savePointEdit").addEventListener("click", savePointEditor);
    $("cancelPointEdit").addEventListener("click", () => closePointEditor(true));
    $("closeDamageDialog").addEventListener("click", () => closePointEditor(true));
    dialog.addEventListener("cancel", event => { event.preventDefault(); closePointEditor(true); });
    dialog.addEventListener("click", event => { if (event.target === dialog) closePointEditor(true); });
    $("galleryPhotos").addEventListener("change", event => { addSelectedPhotos(event.target.files); event.target.value = ""; });
    $("cameraPhotos").addEventListener("change", event => { addSelectedPhotos(event.target.files); event.target.value = ""; });
    $("clearPhotos").addEventListener("click", () => { clearSelectedPhotos(); $("photoCheck").className = "photo-check hidden"; });
    $("preview").addEventListener("click", event => { const btn = event.target.closest("[data-remove-photo]"); if (!btn) return; selectedPhotoFiles.splice(Number(btn.dataset.removePhoto), 1); renderSelectedPhotos(); });
    $("checkPhotos").addEventListener("click", checkPhotos);
    $("estimateBtn").addEventListener("click", () => {
      const estimate = makeEstimate();
      latestEstimate = { date: new Date().toLocaleString("it-IT"), carModel: $("carModel").value.trim() || "Auto non specificata", plate: $("plate").value.trim() || "N/D", city: $("city").value.trim() || "Città non specificata", panels: selectedPanels.length ? selectedPanels.join(", ") : "Punti 3D senza pannello assegnato", panelsArray: [...selectedPanels], damagePoints: damagePoints.map(p => ({ ...p })), dents: String(estimate.dents), dentsValue: String(estimate.dents), size: $("size").value, paint: $("paint").value, name: $("name").value.trim() || "Cliente", phone: $("phone").value.trim() || "N/D", suggestedPrice: estimate.price, finalPrice: estimate.price, estimate: `${estimate.price}€`, severity: estimate.severity, notes: estimate.notes.join(", ") || "Nessuna" };
      $("price").textContent = `${estimate.price}€`; $("finalPrice").value = estimate.price; $("diagnosis").textContent = `Danno ${estimate.severity}. Bolli usati nel calcolo: ${estimate.dents}. Punti 3D: ${damagePoints.length}. ${latestEstimate.notes !== "Nessuna" ? "Note: " + latestEstimate.notes : ""}`;
      $("result").classList.remove("hidden"); $("saveLead").textContent = editIndex === null ? "Salva richiesta" : "Aggiorna richiesta"; $("whatsapp").href = `https://wa.me/?text=${encodeURIComponent(buildMessage(latestEstimate))}`;
    });
    $("finalPrice").addEventListener("input", () => { if (!latestEstimate) return; const value = Number($("finalPrice").value); if (!Number.isFinite(value) || value < 0) return; latestEstimate.finalPrice = value; latestEstimate.estimate = `${value}€`; $("price").textContent = `${value}€`; $("whatsapp").href = `https://wa.me/?text=${encodeURIComponent(buildMessage(latestEstimate))}`; });
    $("saveLead").addEventListener("click", () => { if (!latestEstimate) { alert("Prima genera una stima."); return; } const leads = getLeads(); if (editIndex === null) leads.unshift(latestEstimate); else leads[editIndex] = latestEstimate; putLeads(leads); alert(editIndex === null ? "Richiesta salvata." : "Richiesta aggiornata."); renderLeads(); resetForm(); });
    $("copyText").addEventListener("click", async () => { if (!latestEstimate) return; const text = buildMessage(latestEstimate); try { await navigator.clipboard.writeText(text); } catch { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } alert("Testo copiato."); });
    $("cancelEdit").addEventListener("click", resetForm); $("search").addEventListener("input", renderLeads);
    $("leads").addEventListener("click", event => { const edit = event.target.closest("[data-edit]"), del = event.target.closest("[data-delete]"); if (edit) loadEdit(Number(edit.dataset.edit)); if (del && confirm("Vuoi davvero eliminare questa richiesta?")) { const leads = getLeads(); leads.splice(Number(del.dataset.delete), 1); putLeads(leads); renderLeads(); } });
  }

  bindEvents(); refreshPanelSummary(); renderLeads();
})();
