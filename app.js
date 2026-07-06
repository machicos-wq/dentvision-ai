// DentVision AI v1.8.2
// Ogni punto 3D ha la sua scheda e le sue foto, salvate localmente nel browser tramite IndexedDB.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORE = "dentvision_leads";
  const PHOTO_DB = "dentvision_point_photos";
  const PHOTO_STORE = "photos";
  const MAX_PHOTOS_PER_POINT = 6;
  const viewer = $("car3d");
  const dialog = $("damageDialog");

  let damagePoints = [];
  let selectedPanels = [];
  let latestEstimate = null;
  let editIndex = null;
  let modelReady = false;
  let press = null;
  let editingPointIndex = null;
  let creatingPointIndex = null;
  let activePointPhotos = [];
  let previewUrls = [];
  let photoDbPromise = null;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const getLeads = () => {
    try {
      const data = JSON.parse(localStorage.getItem(STORE) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  };

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
    note: String(point.note || ""),
    photoCount: Math.max(0, Number(point.photoCount) || 0)
  });

  function setModelStatus(text, type = "warning") {
    const badge = $("threeStatus");
    badge.textContent = text;
    badge.className = `status-pill ${type}`;
  }

  function totalPointDents() {
    return damagePoints.reduce((sum, point) => sum + Math.max(1, Number(point.dents) || 1), 0);
  }

  // ---------- Database foto locale ----------

  function openPhotoDb() {
    if (photoDbPromise) return photoDbPromise;

    photoDbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Il browser non supporta l'archivio foto locale."));
        return;
      }

      const request = indexedDB.open(PHOTO_DB, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        let store;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          store = db.createObjectStore(PHOTO_STORE, { keyPath: "photoId" });
        } else {
          store = request.transaction.objectStore(PHOTO_STORE);
        }

        if (!store.indexNames.contains("pointId")) {
          store.createIndex("pointId", "pointId", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Impossibile aprire l'archivio foto."));
    });

    return photoDbPromise;
  }

  async function dbAction(mode, action) {
    const db = await openPhotoDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PHOTO_STORE, mode);
      const store = transaction.objectStore(PHOTO_STORE);
      let result;

      try {
        result = action(store);
      } catch (error) {
        reject(error);
        return;
      }

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("Errore archivio foto."));
      transaction.onabort = () => reject(transaction.error || new Error("Operazione foto annullata."));
    });
  }

  async function getPointPhotos(pointId) {
    const db = await openPhotoDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PHOTO_STORE, "readonly");
      const index = transaction.objectStore(PHOTO_STORE).index("pointId");
      const request = index.getAll(pointId);

      request.onsuccess = () => {
        const photos = (request.result || []).sort((a, b) => a.createdAt - b.createdAt);
        resolve(photos);
      };
      request.onerror = () => reject(request.error || new Error("Impossibile leggere le foto."));
    });
  }

  async function savePointPhoto(pointId, file) {
    const photoId = `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const record = {
      photoId,
      pointId,
      blob: file,
      name: file.name || "foto_danno",
      type: file.type || "image/*",
      size: file.size || 0,
      createdAt: Date.now()
    };

    await dbAction("readwrite", (store) => store.put(record));
    return record;
  }

  async function removePointPhoto(photoId) {
    await dbAction("readwrite", (store) => store.delete(photoId));
  }

  async function removePhotosForPointIds(pointIds) {
    const ids = [...new Set((pointIds || []).filter(Boolean))];
    if (!ids.length) return;

    for (const pointId of ids) {
      const photos = await getPointPhotos(pointId);
      for (const photo of photos) {
        await removePointPhoto(photo.photoId);
      }
    }
  }

  function revokePreviewUrls() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
  }

  function isImageFile(file) {
    return Boolean(
      file &&
      (String(file.type || "").startsWith("image/") ||
        /\.(jpe?g|png|webp|heic|gif)$/i.test(String(file.name || "")))
    );
  }

  // ---------- Punti danno ----------

  function refreshPanelSummary() {
    selectedPanels = [...new Set(damagePoints.map(point => point.panel).filter(panel => panel && panel !== "Da definire"))];

    const count = damagePoints.length;
    const total = totalPointDents();

    $("pointCount").textContent = `${count} punt${count === 1 ? "o" : "i"} danno segnat${count === 1 ? "o" : "i"} · ${total} boll${total === 1 ? "o" : "i"} indicat${total === 1 ? "o" : "i"}`;
    $("panelSummary").textContent = `Pannelli: ${selectedPanels.length ? selectedPanels.join(", ") : "da definire"}`;

    const list = $("damageList");
    list.innerHTML = "";

    if (!count) {
      list.innerHTML = "<p class='hint'>Nessun punto ancora. Ruota l’auto, fai zoom e tocca la carrozzeria: si aprirà subito la scheda con note, quantità e foto.</p>";
      return;
    }

    damagePoints.forEach((point, index) => {
      const row = document.createElement("div");
      row.className = "damage-item detail-item";

      const paintText = point.paint === "si" ? "Vernice danneggiata" : "Vernice integra";
      const photoText = `${point.photoCount || 0} fot${Number(point.photoCount || 0) === 1 ? "o" : "o"}`;

      row.innerHTML = `
        <div class="damage-copy">
          <strong>Punto ${index + 1} · ${esc(point.panel)}</strong>
          <span>${esc(point.dents)} boll${Number(point.dents) === 1 ? "o" : "i"} ${esc(point.size)} · profondità ${esc(point.depth)} · ${paintText}</span>
          <span class="photo-count-inline">📷 ${photoText}</span>
          ${point.note ? `<em>Nota: ${esc(point.note)}</em>` : "<em class='missing-note'>Nessuna nota</em>"}
        </div>
        <div class="damage-row-actions">
          <button type="button" data-edit-point="${index}">Modifica</button>
          <button type="button" data-remove-point="${index}" class="danger-mini">Rimuovi</button>
        </div>`;

      list.appendChild(row);
    });
  }

  function clearMarkersOnModel() {
    viewer.querySelectorAll(".damage-marker").forEach(marker => marker.remove());
  }

  function markerTitle(point, number) {
    const photoNote = point.photoCount ? ` · ${point.photoCount} foto` : "";
    return `Punto ${number}: ${point.panel} · ${point.dents} bolli ${point.size}${photoNote}${point.note ? ` · ${point.note}` : ""}`;
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
      if (index >= 0) void openPointEditor(index, false);
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
      note: "",
      photoCount: 0
    });

    damagePoints.push(point);
    restoreMarkers();
    refreshPanelSummary();
    void openPointEditor(damagePoints.length - 1, true);
  }

  async function openPointEditor(index, isNew) {
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

    await loadPointPhotos(point.id);
  }

  async function closePointEditor(discardNew = false) {
    const removedPoint = discardNew && creatingPointIndex !== null ? damagePoints[creatingPointIndex] : null;

    if (removedPoint) {
      damagePoints.splice(creatingPointIndex, 1);
      await removePhotosForPointIds([removedPoint.id]);
      restoreMarkers();
      refreshPanelSummary();
    }

    revokePreviewUrls();
    activePointPhotos = [];
    $("pointPhotoPreview").innerHTML = "";
    $("pointPhotoHint").textContent = "Nessuna foto collegata a questo punto.";
    $("pointPhotoBadge").textContent = "0 foto";
    $("pointPhotoCheck").className = "photo-check hidden";

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
    void closePointEditor(false);
  }

  // ---------- Foto per singolo punto ----------

  function getEditingPoint() {
    return editingPointIndex === null ? null : damagePoints[editingPointIndex] || null;
  }

  async function loadPointPhotos(pointId) {
    revokePreviewUrls();
    $("pointPhotoPreview").innerHTML = "";
    $("pointPhotoHint").textContent = "Caricamento foto…";
    $("pointPhotoBadge").textContent = "…";

    try {
      const photos = await getPointPhotos(pointId);
      const point = damagePoints.find(item => item.id === pointId);
      if (point) point.photoCount = photos.length;

      // If the user opened another point before the database returned, do not paint the wrong photos.
      if (getEditingPoint()?.id !== pointId) return;

      activePointPhotos = photos;
      renderPointPhotos();
      refreshPanelSummary();
      restoreMarkers();
    } catch (error) {
      console.warn(error);
      activePointPhotos = [];
      $("pointPhotoHint").textContent = "Archivio foto non disponibile su questo browser.";
      $("pointPhotoBadge").textContent = "0 foto";
    }
  }

  function renderPointPhotos() {
    revokePreviewUrls();
    const holder = $("pointPhotoPreview");
    holder.innerHTML = "";

    const count = activePointPhotos.length;
    $("pointPhotoHint").textContent = count
      ? `${count} foto collegata${count === 1 ? "" : "e"} a questo danno.`
      : "Nessuna foto collegata a questo punto.";
    $("pointPhotoBadge").textContent = `${count} foto`;

    activePointPhotos.forEach((photo, index) => {
      const tile = document.createElement("div");
      tile.className = "photo-tile";

      const image = document.createElement("img");
      const url = URL.createObjectURL(photo.blob);
      previewUrls.push(url);
      image.src = url;
      image.alt = `Foto del danno ${index + 1}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-photo";
      remove.dataset.removePointPhoto = photo.photoId;
      remove.setAttribute("aria-label", `Rimuovi foto ${index + 1}`);
      remove.textContent = "×";

      tile.append(image, remove);
      holder.appendChild(tile);
    });
  }

  async function addPointPhotos(fileList) {
    const point = getEditingPoint();
    if (!point) {
      alert("Apri prima la scheda di un punto danno.");
      return;
    }

    const files = [...(fileList || [])].filter(isImageFile);
    if (!files.length) {
      alert("Nessuna immagine valida selezionata.");
      return;
    }

    const available = Math.max(0, MAX_PHOTOS_PER_POINT - activePointPhotos.length);
    if (!available) {
      alert(`Puoi collegare al massimo ${MAX_PHOTOS_PER_POINT} foto a questo punto.`);
      return;
    }

    const toSave = files.slice(0, available);
    let saved = 0;

    try {
      for (const file of toSave) {
        await savePointPhoto(point.id, file);
        saved++;
      }

      if (files.length > toSave.length) {
        alert(`Sono state aggiunte ${saved} foto. Il limite per punto è ${MAX_PHOTOS_PER_POINT}.`);
      }

      await loadPointPhotos(point.id);
      $("pointPhotoCheck").className = "photo-check hidden";
    } catch (error) {
      console.error(error);
      alert("Non sono riuscito a salvare una o più foto. Prova con immagini più leggere.");
    }
  }

  async function removePhotoFromPoint(photoId) {
    const point = getEditingPoint();
    if (!point) return;

    await removePointPhoto(photoId);
    await loadPointPhotos(point.id);
    $("pointPhotoCheck").className = "photo-check hidden";
  }

  async function clearPhotosFromPoint() {
    const point = getEditingPoint();
    if (!point || !activePointPhotos.length) return;

    if (!confirm(`Vuoi cancellare tutte le ${activePointPhotos.length} foto di questo danno?`)) return;

    await removePhotosForPointIds([point.id]);
    await loadPointPhotos(point.id);
    $("pointPhotoCheck").className = "photo-check hidden";
  }

  function imageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Immagine non leggibile"));
      };
      image.src = url;
    });
  }

  async function checkPointPhotos() {
    const photos = activePointPhotos.slice(0, MAX_PHOTOS_PER_POINT);
    if (!photos.length) {
      alert("Prima aggiungi almeno una foto a questo danno.");
      return;
    }

    let weak = 0;
    let low = 0;

    for (const photo of photos) {
      try {
        const image = await imageFromBlob(photo.blob);
        if (image.naturalWidth < 900 || image.naturalHeight < 600) low++;

        const canvas = document.createElement("canvas");
        const width = Math.min(150, image.naturalWidth);
        const height = Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth));
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, width, height);

        const pixels = context.getImageData(0, 0, width, height).data;
        let sum = 0;
        let sumSq = 0;

        for (let i = 0; i < pixels.length; i += 4) {
          const brightness = .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
          sum += brightness;
          sumSq += brightness * brightness;
        }

        const count = pixels.length / 4;
        const mean = sum / count;
        const contrast = Math.sqrt(Math.max(0, sumSq / count - mean * mean));

        if (mean < 55 || mean > 205 || contrast < 20) weak++;
      } catch {
        weak++;
      }
    }

    const score = Math.max(0, 100 - (photos.length < 3 ? 30 : 0) - weak * 18 - low * 10);
    const issues = [];
    if (photos.length < 3) issues.push("per una buona analisi servono almeno 3 foto");
    if (weak) issues.push(`${weak} foto con luce o contrasto debole`);
    if (low) issues.push(`${low} foto poco definite`);

    const box = $("pointPhotoCheck");
    box.className = `photo-check ${score >= 70 ? "good" : "warning"}`;
    box.innerHTML = `<strong>Controllo foto zona: ${score}/100</strong><br><span class="small">${issues.length ? issues.join(" · ") : "Qualità tecnica buona per questa zona danno."}</span>`;
  }

  // ---------- Modello 3D ----------

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
    if (!modelReady && !customElements.get("model-viewer")) {
      setModelStatus("Motore 3D in attesa", "warning");
    }
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

  const cameraViews = {
    front: "0deg 76deg 105%",
    rear: "180deg 76deg 105%",
    left: "-90deg 76deg 105%",
    right: "90deg 76deg 105%",
    top: "0deg 8deg 120%",
    reset: "-35deg 68deg 105%"
  };

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
      if (modelReady) viewer.cameraOrbit = cameraViews[button.dataset.view] || cameraViews.reset;
    });
  });

  // ---------- Preventivo e archivio ----------

  function basePrice(dents) {
    if (dents <= 50) return 350;
    if (dents <= 200) return 550;
    if (dents <= 300) return 750;
    if (dents <= 550) return 950;
    return 1150;
  }

  function makeEstimate() {
    const typed = Math.round(Number($("dents").value) || 0);
    const dents = Math.max(1, typed || totalPointDents() || 1);
    let price = basePrice(dents);
    const notes = [];

    if (selectedPanels.length === 2) {
      price *= 1.15;
      notes.push("2 pannelli: +15%");
    } else if (selectedPanels.length === 3) {
      price *= 1.25;
      notes.push("3 pannelli: +25%");
    } else if (selectedPanels.length >= 4) {
      price *= 1.40;
      notes.push("4+ pannelli: +40%");
    }

    if (selectedPanels.includes("Tetto")) {
      price *= 1.15;
      notes.push("Tetto: +15%");
    }

    if (selectedPanels.includes("Fiancata sinistra") || selectedPanels.includes("Fiancata destra")) {
      price *= 1.10;
      notes.push("Fiancata: +10%");
    }

    if ($("size").value === "media") {
      price *= 1.10;
      notes.push("Bolli medi: +10%");
    }

    if ($("size").value === "grande") {
      price *= 1.25;
      notes.push("Bolli grandi: +25%");
    }

    if ($("paint").value === "si") {
      notes.push("Vernice danneggiata: valutare carrozzeria");
    }

    const severity = dents > 550 ? "molto importante" : dents > 200 ? "importante" : dents > 50 ? "medio" : "lieve";
    return { dents, price: Math.round(price / 10) * 10, severity, notes };
  }

  function pointDetailsText(points = []) {
    if (!points.length) return "Nessun punto 3D dettagliato.";

    return points.map((point, index) => {
      const p = normalizePoint(point);
      const photoText = `${p.photoCount} fot${p.photoCount === 1 ? "o" : "o"}`;
      return `${index + 1}. ${p.panel}: ${p.dents} boll${p.dents === 1 ? "o" : "i"} ${p.size}, profondità ${p.depth}, vernice ${p.paint === "si" ? "danneggiata" : "integra"}, ${photoText}${p.note ? `, nota: ${p.note}` : ""}`;
    }).join("\n");
  }

  function buildMessage(data) {
    return `DentVision AI - Nuova richiesta
Cliente: ${data.name}
Telefono: ${data.phone}
Auto: ${data.carModel}
Targa/Rif.: ${data.plate}
Città: ${data.city}
Punti danno 3D: ${data.damagePoints.length}
Dettaglio punti:
${pointDetailsText(data.damagePoints)}
Numero bolli totale: ${data.dents}
Grandezza media: ${data.size}
Vernice danneggiata: ${data.paint}
Prezzo suggerito: ${data.suggestedPrice}€
Prezzo finale: ${data.finalPrice}€
Gravità: ${data.severity}
Note preventivo: ${data.notes}`;
  }

  function renderLeads() {
    const query = $("search").value.trim().toLowerCase();
    const holder = $("leads");
    holder.innerHTML = "";

    const matches = getLeads()
      .map((lead, index) => ({ lead, index }))
      .filter(({ lead }) => [
        lead.name,
        lead.phone,
        lead.plate,
        lead.carModel,
        lead.city,
        lead.panels,
        pointDetailsText(lead.damagePoints || [])
      ].join(" ").toLowerCase().includes(query));

    if (!matches.length) {
      holder.innerHTML = "<p class='hint'>Nessuna richiesta trovata.</p>";
      return;
    }

    matches.forEach(({ lead, index }) => {
      const photoTotal = (lead.damagePoints || []).reduce((sum, point) => sum + Math.max(0, Number(point.photoCount) || 0), 0);
      const row = document.createElement("div");
      row.className = "lead";
      row.innerHTML = `<strong>${esc(lead.name)}</strong> · ${esc(lead.carModel)}<br>
        ${esc(lead.city)} · ${esc(lead.estimate)} · ${esc(lead.date)}<br>
        <span class="small">Tel: ${esc(lead.phone)} · Targa/Rif.: ${esc(lead.plate)} · Bolli: ${esc(lead.dents)} · Punti 3D: ${(lead.damagePoints || []).length} · Foto zona: ${photoTotal}</span>
        <div class="lead-actions">
          <button type="button" data-edit="${index}">Modifica</button>
          <button type="button" class="danger" data-delete="${index}">Elimina</button>
          <a class="whatsapp" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(buildMessage(lead))}">WhatsApp</a>
        </div>`;
      holder.appendChild(row);
    });
  }

  function resetForm() {
    ["carModel", "plate", "city", "dents", "name", "phone", "finalPrice"].forEach(id => $(id).value = "");
    $("size").value = "piccola";
    $("paint").value = "no";
    $("result").classList.add("hidden");
    $("cancelEdit").classList.add("hidden");
    $("saveLead").textContent = "Salva richiesta";

    damagePoints = [];
    selectedPanels = [];
    restoreMarkers();
    refreshPanelSummary();

    latestEstimate = null;
    editIndex = null;
    void closePointEditor(false);
  }

  function loadEdit(index) {
    const lead = getLeads()[index];
    if (!lead) return;

    editIndex = index;
    $("carModel").value = lead.carModel === "Auto non specificata" ? "" : lead.carModel;
    $("plate").value = lead.plate === "N/D" ? "" : lead.plate;
    $("city").value = lead.city === "Città non specificata" ? "" : lead.city;
    $("dents").value = lead.dentsValue || lead.dents || "";
    $("size").value = lead.size || "piccola";
    $("paint").value = lead.paint || "no";
    $("name").value = lead.name === "Cliente" ? "" : lead.name;
    $("phone").value = lead.phone === "N/D" ? "" : lead.phone;

    damagePoints = Array.isArray(lead.damagePoints) ? lead.damagePoints.map(normalizePoint) : [];
    restoreMarkers();
    refreshPanelSummary();
    $("cancelEdit").classList.remove("hidden");
    $("estimateBtn").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- Eventi ----------

  function bindEvents() {
    $("undoPoint").addEventListener("click", async () => {
      const point = damagePoints.pop();
      if (!point) return;
      await removePhotosForPointIds([point.id]);
      restoreMarkers();
      refreshPanelSummary();
    });

    $("clearPoints").addEventListener("click", async () => {
      if (!damagePoints.length || !confirm("Vuoi cancellare tutti i punti danno e le loro foto?")) return;
      const ids = damagePoints.map(point => point.id);
      damagePoints = [];
      await removePhotosForPointIds(ids);
      restoreMarkers();
      refreshPanelSummary();
    });

    $("damageList").addEventListener("click", async event => {
      const remove = event.target.closest("[data-remove-point]");
      const edit = event.target.closest("[data-edit-point]");

      if (remove) {
        const index = Number(remove.dataset.removePoint);
        const [point] = damagePoints.splice(index, 1);
        if (point) await removePhotosForPointIds([point.id]);
        restoreMarkers();
        refreshPanelSummary();
      }

      if (edit) void openPointEditor(Number(edit.dataset.editPoint), false);
    });

    $("savePointEdit").addEventListener("click", savePointEditor);
    $("cancelPointEdit").addEventListener("click", () => void closePointEditor(true));
    $("closeDamageDialog").addEventListener("click", () => void closePointEditor(true));
    dialog.addEventListener("cancel", event => {
      event.preventDefault();
      void closePointEditor(true);
    });
    dialog.addEventListener("click", event => {
      if (event.target === dialog) void closePointEditor(true);
    });

    $("pointGalleryPhotos").addEventListener("change", event => {
      void addPointPhotos(event.target.files);
      event.target.value = "";
    });

    $("pointCameraPhotos").addEventListener("change", event => {
      void addPointPhotos(event.target.files);
      event.target.value = "";
    });

    $("pointPhotoPreview").addEventListener("click", event => {
      const button = event.target.closest("[data-remove-point-photo]");
      if (button) void removePhotoFromPoint(button.dataset.removePointPhoto);
    });

    $("clearPointPhotos").addEventListener("click", () => void clearPhotosFromPoint());
    $("checkPointPhotos").addEventListener("click", () => void checkPointPhotos());

    $("estimateBtn").addEventListener("click", () => {
      const estimate = makeEstimate();

      latestEstimate = {
        date: new Date().toLocaleString("it-IT"),
        carModel: $("carModel").value.trim() || "Auto non specificata",
        plate: $("plate").value.trim() || "N/D",
        city: $("city").value.trim() || "Città non specificata",
        panels: selectedPanels.length ? selectedPanels.join(", ") : "Punti 3D senza pannello assegnato",
        panelsArray: [...selectedPanels],
        damagePoints: damagePoints.map(point => ({ ...point })),
        dents: String(estimate.dents),
        dentsValue: String(estimate.dents),
        size: $("size").value,
        paint: $("paint").value,
        name: $("name").value.trim() || "Cliente",
        phone: $("phone").value.trim() || "N/D",
        suggestedPrice: estimate.price,
        finalPrice: estimate.price,
        estimate: `${estimate.price}€`,
        severity: estimate.severity,
        notes: estimate.notes.join(", ") || "Nessuna"
      };

      $("price").textContent = `${estimate.price}€`;
      $("finalPrice").value = estimate.price;
      $("diagnosis").textContent = `Danno ${estimate.severity}. Bolli usati nel calcolo: ${estimate.dents}. Punti 3D: ${damagePoints.length}. Foto collegate ai punti: ${damagePoints.reduce((sum, point) => sum + (point.photoCount || 0), 0)}. ${latestEstimate.notes !== "Nessuna" ? "Note: " + latestEstimate.notes : ""}`;
      $("result").classList.remove("hidden");
      $("saveLead").textContent = editIndex === null ? "Salva richiesta" : "Aggiorna richiesta";
      $("whatsapp").href = `https://wa.me/?text=${encodeURIComponent(buildMessage(latestEstimate))}`;
    });

    $("finalPrice").addEventListener("input", () => {
      if (!latestEstimate) return;
      const value = Number($("finalPrice").value);
      if (!Number.isFinite(value) || value < 0) return;

      latestEstimate.finalPrice = value;
      latestEstimate.estimate = `${value}€`;
      $("price").textContent = `${value}€`;
      $("whatsapp").href = `https://wa.me/?text=${encodeURIComponent(buildMessage(latestEstimate))}`;
    });

    $("saveLead").addEventListener("click", () => {
      if (!latestEstimate) {
        alert("Prima genera una stima.");
        return;
      }

      const leads = getLeads();
      if (editIndex === null) leads.unshift(latestEstimate);
      else leads[editIndex] = latestEstimate;

      putLeads(leads);
      alert(editIndex === null ? "Richiesta salvata." : "Richiesta aggiornata.");
      renderLeads();
      resetForm();
    });

    $("copyText").addEventListener("click", async () => {
      if (!latestEstimate) return;
      const text = buildMessage(latestEstimate);

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }

      alert("Testo copiato.");
    });

    $("cancelEdit").addEventListener("click", resetForm);
    $("search").addEventListener("input", renderLeads);

    $("leads").addEventListener("click", async event => {
      const edit = event.target.closest("[data-edit]");
      const del = event.target.closest("[data-delete]");

      if (edit) loadEdit(Number(edit.dataset.edit));

      if (del && confirm("Vuoi davvero eliminare questa richiesta e le foto locali collegate?")) {
        const leads = getLeads();
        const index = Number(del.dataset.delete);
        const [removed] = leads.splice(index, 1);

        await removePhotosForPointIds((removed?.damagePoints || []).map(point => point.id));
        putLeads(leads);
        renderLeads();
      }
    });
  }

  bindEvents();
  refreshPanelSummary();
  renderLeads();
})();
