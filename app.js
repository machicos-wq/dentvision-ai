// DentVision AI v2.1.2 Locale gratuita
// Gestione pratica PDR completa: modello 3D, zone, foto, preventivo, archivio, PDF e backup.
// Le foto restano in IndexedDB, localmente sul browser di questo telefono.
// Analisi locale gratuita: nessuna API, nessuna chiave, nessun costo.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const CASES_KEY = "dentvision_v2_cases";
  const DRAFT_KEY = "dentvision_v2_draft";
  const PHOTO_DB = "dentvision_v2_point_photos";
  const PHOTO_STORE = "photos";
  const MAX_PHOTOS_PER_POINT = 6;

  const viewer = $("car3d");
  const dialog = $("damageDialog");

  const FORM_IDS = [
    "clientName", "phone", "email",
    "carModel", "plate", "city",
    "status", "priority", "eventDate", "appointment",
    "insurer", "claimCode", "nextAction",
    "manualDents", "globalSize", "globalPaint", "difficulty",
    "caseNotes", "finalPrice"
  ];

  const STATUS_CLASS = {
    "Nuova": "nuova",
    "Sopralluogo": "sopralluogo",
    "Preventivo inviato": "preventivo",
    "Approvata": "approvata",
    "Da fissare": "fissare",
    "In lavorazione": "lavorazione",
    "Completata": "completata",
    "Persa": "persa"
  };

  let state = freshState();
  let modelReady = false;
  let press = null;
  let editingPointIndex = null;
  let creatingPointIndex = null;
  let activePointPhotos = [];
  let previewUrls = [];
  let photoDbPromise = null;
  let draftTimer = null;

  function freshCaseId() {
    const date = new Date();
    const ymd = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("");
    const random = Math.floor(1000 + Math.random() * 9000);
    return `DV-${ymd}-${random}`;
  }

  function freshState() {
    return {
      id: null,
      caseId: freshCaseId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      points: [],
      lastQuote: null
    };
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizePoint(point = {}) {
    return {
      id: point.id || `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      surface: point.surface || "",
      position: point.position || "",
      normal: point.normal || "",
      panel: point.panel || "Da definire",
      zone: point.zone || "",
      dents: Math.max(1, Number(point.dents) || 1),
      size: ["piccola", "media", "grande"].includes(point.size) ? point.size : "piccola",
      depth: ["lieve", "media", "forte"].includes(point.depth) ? point.depth : "lieve",
      paint: point.paint === "si" ? "si" : "no",
      note: String(point.note || ""),
      photoCount: Math.max(0, Number(point.photoCount) || 0),
      aiAnalysis: point.aiAnalysis && typeof point.aiAnalysis === "object" ? { ...point.aiAnalysis } : null
    };
  }

  function getCases() {
    try {
      const raw = JSON.parse(localStorage.getItem(CASES_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function putCases(cases) {
    localStorage.setItem(CASES_KEY, JSON.stringify(cases));
  }

  function getForm() {
    return FORM_IDS.reduce((data, id) => {
      data[id] = $(id).value;
      return data;
    }, {});
  }

  function applyForm(data = {}) {
    FORM_IDS.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(data, id)) {
        $(id).value = data[id] ?? "";
      }
    });

    if (!data.status) $("status").value = "Nuova";
    if (!data.priority) $("priority").value = "Normale";
    if (!data.globalSize) $("globalSize").value = "piccola";
    if (!data.globalPaint) $("globalPaint").value = "no";
    if (!data.difficulty) $("difficulty").value = "standard";
  }

  function restoreDefaults() {
    applyForm({
      status: "Nuova",
      priority: "Normale",
      globalSize: "piccola",
      globalPaint: "no",
      difficulty: "standard"
    });
  }

  function updateCaseHeader() {
    $("caseIdText").textContent = state.caseId;
    $("dashStatus").textContent = $("status").value || "Nuova";
  }

  function scheduleDraft() {
    clearTimeout(draftTimer);
    $("draftStatus").textContent = "Salvataggio bozza…";
    draftTimer = setTimeout(saveDraft, 350);
  }

  function saveDraft() {
    try {
      state.updatedAt = new Date().toISOString();
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        ...state,
        form: getForm()
      }));
      $("draftStatus").textContent = `Bozza salvata · ${new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (error) {
      console.warn(error);
      $("draftStatus").textContent = "Bozza non salvata";
    }
  }

  function restoreDraft() {
    try {
      const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!raw || !raw.caseId) {
        restoreDefaults();
        return;
      }

      state = {
        id: raw.id || null,
        caseId: raw.caseId,
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        points: Array.isArray(raw.points) ? raw.points.map(normalizePoint) : [],
        lastQuote: raw.lastQuote || null
      };
      applyForm(raw.form || {});
      updateCaseHeader();
    } catch {
      restoreDefaults();
    }
  }

  // ---------- IndexedDB foto ----------

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

      request.onsuccess = () => resolve((request.result || []).sort((a, b) => a.createdAt - b.createdAt));
      request.onerror = () => reject(request.error || new Error("Impossibile leggere le foto."));
    });
  }

  async function savePointPhoto(pointId, file) {
    const record = {
      photoId: `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
    const unique = [...new Set((pointIds || []).filter(Boolean))];
    for (const pointId of unique) {
      const photos = await getPointPhotos(pointId);
      for (const photo of photos) await removePointPhoto(photo.photoId);
    }
  }

  function isImageFile(file) {
    return Boolean(
      file &&
      (String(file.type || "").startsWith("image/") ||
        /\.(jpe?g|png|webp|heic|gif)$/i.test(String(file.name || "")))
    );
  }

  function revokePreviewUrls() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
  }

  // ---------- Danni 3D ----------

  function totalDents() {
    return state.points.reduce((sum, point) => sum + Math.max(1, Number(point.dents) || 1), 0);
  }

  function totalPhotos() {
    return state.points.reduce((sum, point) => sum + Math.max(0, Number(point.photoCount) || 0), 0);
  }

  function selectedPanels() {
    return [...new Set(state.points.map((point) => point.panel).filter((panel) => panel && panel !== "Da definire"))];
  }

  function updateDashboard() {
    updateCaseHeader();
    $("dashZones").textContent = String(state.points.length);
    $("dashDents").textContent = String(totalDents());
    $("dashPhotos").textContent = String(totalPhotos());

    const estimate = calculateEstimate(false);
    $("dashHours").textContent = estimate.dents ? `${estimate.hours} h` : "—";
  }

  function refreshDamageUI() {
    const panels = selectedPanels();
    const count = state.points.length;
    const dents = totalDents();

    $("pointCount").textContent = `${count} zon${count === 1 ? "a" : "e"} danno · ${dents} boll${dents === 1 ? "o" : "i"}`;
    $("panelSummary").textContent = `Pannelli: ${panels.length ? panels.join(", ") : "da definire"}`;

    const holder = $("damageList");
    holder.innerHTML = "";

    if (!count) {
      holder.innerHTML = "<p class='hint'>Nessuna zona ancora. Tocca l’auto e apri la sua scheda. Un punto deve rappresentare una zona di lavoro, non un singolo bollo.</p>";
      updateDashboard();
      scheduleDraft();
      return;
    }

    state.points.forEach((point, index) => {
      const item = document.createElement("div");
      item.className = "damage-item";

      const paintText = point.paint === "si" ? "vernice danneggiata" : "vernice integra";
      const zoneText = point.zone ? ` · ${point.zone}` : "";
      const photoText = `${point.photoCount || 0} foto`;

      item.innerHTML = `
        <div class="damage-copy">
          <strong>${index + 1}. ${esc(point.panel)}${esc(zoneText)}</strong>
          <span>${point.dents} boll${point.dents === 1 ? "o" : "i"} ${esc(point.size)} · profondità ${esc(point.depth)} · ${paintText}</span>
          <span class="photo-count-inline">📷 ${photoText}</span>
          ${point.note ? `<em>Nota: ${esc(point.note)}</em>` : "<em class='missing-note'>Nessuna nota</em>"}
        </div>
        <div class="damage-row-actions">
          <button type="button" data-edit-point="${index}">Modifica</button>
          <button type="button" data-remove-point="${index}" class="danger-mini">Rimuovi</button>
        </div>`;

      holder.appendChild(item);
    });

    updateDashboard();
    scheduleDraft();
  }

  function clearMarkers() {
    viewer.querySelectorAll(".damage-marker").forEach((marker) => marker.remove());
  }

  function markerTitle(point, number) {
    return `Zona ${number}: ${point.panel}${point.zone ? `, ${point.zone}` : ""} · ${point.dents} bolli ${point.size}${point.photoCount ? ` · ${point.photoCount} foto` : ""}`;
  }

  function createMarker(point, number) {
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

    marker.addEventListener("pointerdown", (event) => event.stopPropagation());
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      const index = state.points.findIndex((item) => item.id === point.id);
      if (index >= 0) void openPointDialog(index, false);
    });

    viewer.appendChild(marker);
  }

  function restoreMarkers() {
    clearMarkers();
    if (!modelReady) return;
    state.points.forEach((point, index) => createMarker(point, index + 1));
  }

  function addPoint(hit) {
    state.points.push(normalizePoint({
      id: `p-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      surface: hit.surface || "",
      position: hit.position || "",
      normal: hit.normal || "",
      panel: "Da definire",
      zone: "",
      dents: 1,
      size: "piccola",
      depth: "lieve",
      paint: "no",
      note: "",
      photoCount: 0
    }));
    restoreMarkers();
    refreshDamageUI();
    void openPointDialog(state.points.length - 1, true);
  }

  // ---------- Dialog punto + foto ----------

  async function openPointDialog(index, isNew) {
    const point = state.points[index];
    if (!point) return;

    editingPointIndex = index;
    creatingPointIndex = isNew ? index : null;

    $("damageDialogTitle").textContent = `Zona ${index + 1} · dettagli`;
    $("pointPanel").value = point.panel || "Da definire";
    $("pointZone").value = point.zone || "";
    $("pointDents").value = Math.max(1, Number(point.dents) || 1);
    $("pointSize").value = point.size || "piccola";
    $("pointDepth").value = point.depth || "lieve";
    $("pointPaint").value = point.paint === "si" ? "si" : "no";
    $("pointNote").value = point.note || "";
    renderAiResult(point.aiAnalysis);

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    await loadPointPhotos(point.id);
  }

  async function closePointDialog(discardNew = false) {
    const pointToDelete = discardNew && creatingPointIndex !== null ? state.points[creatingPointIndex] : null;

    if (pointToDelete) {
      state.points.splice(creatingPointIndex, 1);
      await removePhotosForPointIds([pointToDelete.id]);
      restoreMarkers();
      refreshDamageUI();
    }

    revokePreviewUrls();
    activePointPhotos = [];
    $("pointPhotoPreview").innerHTML = "";
    $("pointPhotoHint").textContent = "Nessuna foto collegata.";
    $("pointPhotoBadge").textContent = "0 foto";
    $("pointPhotoCheck").className = "photo-check hidden";
    renderAiResult(null);
    editingPointIndex = null;
    creatingPointIndex = null;

    if (dialog.open && typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function savePointDialog() {
    if (editingPointIndex === null || !state.points[editingPointIndex]) return;

    const point = state.points[editingPointIndex];
    point.panel = $("pointPanel").value;
    point.zone = $("pointZone").value.trim().slice(0, 120);
    point.dents = Math.max(1, Math.round(Number($("pointDents").value) || 1));
    point.size = $("pointSize").value;
    point.depth = $("pointDepth").value;
    point.paint = $("pointPaint").value;
    point.note = $("pointNote").value.trim().slice(0, 600);

    restoreMarkers();
    refreshDamageUI();
    void closePointDialog(false);
  }

  function editingPoint() {
    return editingPointIndex === null ? null : state.points[editingPointIndex] || null;
  }

  async function loadPointPhotos(pointId) {
    revokePreviewUrls();
    $("pointPhotoPreview").innerHTML = "";
    $("pointPhotoHint").textContent = "Caricamento foto…";
    $("pointPhotoBadge").textContent = "…";

    try {
      const photos = await getPointPhotos(pointId);
      const point = state.points.find((item) => item.id === pointId);
      if (point) point.photoCount = photos.length;

      if (editingPoint()?.id !== pointId) return;

      activePointPhotos = photos;
      renderPointPhotos();
      restoreMarkers();
      refreshDamageUI();
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
    $("pointPhotoHint").textContent = count ? `${count} foto collegata${count === 1 ? "" : "e"} a questa zona.` : "Nessuna foto collegata.";
    $("pointPhotoBadge").textContent = `${count} foto`;

    activePointPhotos.forEach((photo, index) => {
      const tile = document.createElement("div");
      tile.className = "photo-tile";

      const image = document.createElement("img");
      const url = URL.createObjectURL(photo.blob);
      previewUrls.push(url);
      image.src = url;
      image.alt = `Foto zona ${index + 1}`;

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
    const point = editingPoint();
    if (!point) {
      alert("Apri prima una zona danno.");
      return;
    }

    const files = [...(fileList || [])].filter(isImageFile);
    if (!files.length) {
      alert("Nessuna immagine valida selezionata.");
      return;
    }

    const available = Math.max(0, MAX_PHOTOS_PER_POINT - activePointPhotos.length);
    if (!available) {
      alert(`Limite raggiunto: massimo ${MAX_PHOTOS_PER_POINT} foto per zona.`);
      return;
    }

    const selected = files.slice(0, available);

    try {
      for (const file of selected) await savePointPhoto(point.id, file);
      if (files.length > selected.length) alert(`Aggiunte ${selected.length} foto. Il limite per zona è ${MAX_PHOTOS_PER_POINT}.`);
      point.aiAnalysis = null;
      await loadPointPhotos(point.id);
      $("pointPhotoCheck").className = "photo-check hidden";
      renderAiResult(null);
    } catch (error) {
      console.error(error);
      alert("Non sono riuscito a salvare una o più foto. Prova con immagini più leggere.");
    }
  }

  async function removeCurrentPointPhoto(photoId) {
    const point = editingPoint();
    if (!point) return;
    await removePointPhoto(photoId);
    point.aiAnalysis = null;
    await loadPointPhotos(point.id);
    $("pointPhotoCheck").className = "photo-check hidden";
    renderAiResult(null);
  }

  async function clearCurrentPointPhotos() {
    const point = editingPoint();
    if (!point || !activePointPhotos.length) return;
    if (!confirm(`Cancellare tutte le ${activePointPhotos.length} foto di questa zona?`)) return;

    await removePhotosForPointIds([point.id]);
    point.aiAnalysis = null;
    await loadPointPhotos(point.id);
    $("pointPhotoCheck").className = "photo-check hidden";
    renderAiResult(null);
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

  async function checkCurrentPointPhotos() {
    const photos = activePointPhotos.slice(0, MAX_PHOTOS_PER_POINT);
    if (!photos.length) {
      alert("Prima aggiungi almeno una foto.");
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

        const data = context.getImageData(0, 0, width, height).data;
        let sum = 0;
        let sumSq = 0;

        for (let i = 0; i < data.length; i += 4) {
          const brightness = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
          sum += brightness;
          sumSq += brightness * brightness;
        }

        const total = data.length / 4;
        const mean = sum / total;
        const contrast = Math.sqrt(Math.max(0, sumSq / total - mean * mean));

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
    box.innerHTML = `<strong>Controllo foto zona: ${score}/100</strong><br><span class="small">${issues.length ? issues.join(" · ") : "Qualità tecnica buona per questa zona."}</span>`;
  }

  async function calculateLocalPhotoQuality(photos) {
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

        const data = context.getImageData(0, 0, width, height).data;
        let sum = 0;
        let sumSq = 0;

        for (let i = 0; i < data.length; i += 4) {
          const brightness = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
          sum += brightness;
          sumSq += brightness * brightness;
        }

        const total = data.length / 4;
        const mean = sum / total;
        const contrast = Math.sqrt(Math.max(0, sumSq / total - mean * mean));

        if (mean < 55 || mean > 205 || contrast < 20) weak++;
      } catch {
        weak++;
      }
    }

    const score = Math.max(0, 100 - (photos.length < 3 ? 30 : 0) - weak * 18 - low * 10);
    return { score, weak, low };
  }

  function buildLocalSuggestion(point, quality) {
    const dents = Math.max(1, Math.round(Number($("pointDents").value || point.dents) || 1));
    const size = $("pointSize").value || point.size || "piccola";
    const depth = $("pointDepth").value || point.depth || "lieve";
    const paint = $("pointPaint").value || point.paint || "no";
    const panel = $("pointPanel").value || point.panel || "Da definire";

    const spread = dents <= 5 ? 2 : dents <= 30 ? 5 : dents <= 100 ? 15 : 30;
    const min = Math.max(1, dents - spread);
    const max = Math.max(min, dents + spread);

    const needsMore = quality.score < 70 || activePointPhotos.length < 3;
    const confidence = Math.max(10, Math.min(72, Math.round(quality.score * 0.62 + (activePointPhotos.length >= 3 ? 10 : 0))));

    const issues = [];
    if (activePointPhotos.length < 3) issues.push("servono almeno 3 foto della stessa zona");
    if (quality.weak) issues.push(`${quality.weak} foto con luce o contrasto debole`);
    if (quality.low) issues.push(`${quality.low} foto poco definite`);

    return {
      verdict: needsMore ? "Foto da migliorare prima di fidarsi della stima" : "Foto tecnicamente utilizzabili per una valutazione manuale",
      panel_suggestion: panel,
      damage_presence: activePointPhotos.length ? "possible" : "none_visible",
      dent_count_min: min,
      dent_count_max: max,
      suggested_dents: dents,
      size,
      depth,
      paint,
      confidence,
      photo_quality: `${quality.score}/100${issues.length ? " · " + issues.join(" · ") : ""}`,
      needs_more_photos: needsMore,
      caution: "Analisi gratuita locale: non vede davvero i bolli come un modello IA. Usa i dati inseriti da te e controlla solo la qualità tecnica delle foto.",
      explanation: "Questa modalità non usa API a pagamento e non invia immagini fuori dal telefono. Il numero bolli resta quello che hai indicato nella scheda.",
      recommended_photo: "Per lavorare meglio: una foto panoramica, una con luce radente e una ravvicinata sul riflesso della zona.",
      analyzedAt: new Date().toISOString()
    };
  }


  // ---------- Analisi locale gratuita foto ----------

  function aiLabel(value, fallback = "Da valutare") {
    const labels = {
      "none_visible": "Nessun danno chiaro",
      "possible": "Danno possibile",
      "likely": "Danno probabile",
      "piccola": "Piccola",
      "media": "Media",
      "grande": "Grande",
      "non_valutabile": "Non valutabile",
      "lieve": "Lieve",
      "forte": "Forte",
      "no": "Vernice non visibilmente colpita",
      "si": "Vernice da verificare",
      "incerto": "Non valutabile"
    };
    return labels[value] || value || fallback;
  }

  function safeAnalysis(value) {
    if (!value || typeof value !== "object") return null;
    const min = Math.max(0, Math.round(Number(value.dent_count_min) || 0));
    const max = Math.max(min, Math.round(Number(value.dent_count_max) || min));
    const suggested = Math.min(max, Math.max(min, Math.round(Number(value.suggested_dents) || min)));
    return {
      verdict: String(value.verdict || "Pre-analisi IA"),
      panel_suggestion: String(value.panel_suggestion || "Da definire"),
      damage_presence: String(value.damage_presence || "possible"),
      dent_count_min: min,
      dent_count_max: max,
      suggested_dents: suggested,
      size: ["piccola", "media", "grande", "non_valutabile"].includes(value.size) ? value.size : "non_valutabile",
      depth: ["lieve", "media", "forte", "non_valutabile"].includes(value.depth) ? value.depth : "non_valutabile",
      paint: ["no", "si", "incerto"].includes(value.paint) ? value.paint : "incerto",
      confidence: Math.max(0, Math.min(100, Math.round(Number(value.confidence) || 0))),
      photo_quality: String(value.photo_quality || "Da verificare"),
      needs_more_photos: Boolean(value.needs_more_photos),
      caution: String(value.caution || "Conferma sempre dal vivo prima di preventivare."),
      explanation: String(value.explanation || "Nessun dettaglio disponibile."),
      recommended_photo: String(value.recommended_photo || "Scatta una foto ravvicinata con luce radente.") ,
      analyzedAt: value.analyzedAt || new Date().toISOString()
    };
  }

  function renderAiResult(analysis) {
    const holder = $("aiResult");
    const data = safeAnalysis(analysis);
    if (!data) {
      holder.className = "ai-result hidden";
      holder.innerHTML = "";
      return;
    }

    holder.className = "ai-result";
    const range = data.dent_count_min === data.dent_count_max
      ? `${data.dent_count_min}`
      : `${data.dent_count_min}–${data.dent_count_max}`;
    const more = data.needs_more_photos ? `<p><b>Foto consigliata:</b> ${esc(data.recommended_photo)}</p>` : "";
    holder.innerHTML = `
      <span class="ai-status">Assistente locale · gratuito</span>
      <h4>${esc(data.verdict)}</h4>
      <div class="ai-result-grid">
        <div><span>Bolli stimati</span><strong>${esc(range)}</strong></div>
        <div><span>Confidenza</span><strong>${esc(data.confidence)}%</strong></div>
        <div><span>Grandezza</span><strong>${esc(aiLabel(data.size))}</strong></div>
        <div><span>Profondità</span><strong>${esc(aiLabel(data.depth))}</strong></div>
        <div><span>Vernice</span><strong>${esc(aiLabel(data.paint))}</strong></div>
        <div><span>Qualità foto</span><strong>${esc(data.photo_quality)}</strong></div>
      </div>
      <p><b>Zona suggerita:</b> ${esc(data.panel_suggestion)}</p>
      <p>${esc(data.explanation)}</p>
      <p><b>Attenzione:</b> ${esc(data.caution)}</p>
      ${more}
      <div class="ai-result-actions"><button type="button" id="applyAiSuggestion">Applica suggerimento</button></div>`;
  }

  async function blobToAiDataUrl(blob) {
    const image = await imageFromBlob(blob);
    const maxSide = 1600;
    const largest = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = largest > maxSide ? maxSide / largest : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", .84);
  }

  function setAiLoading(isLoading, text = "") {
    const button = $("analyzePointAi");
    button.disabled = isLoading;
    button.textContent = isLoading ? "Analisi locale…" : "Analisi locale gratuita";
    if (!isLoading) return;
    const holder = $("aiResult");
    holder.className = "ai-result loading";
    holder.innerHTML = `<span class="ai-status">Assistente locale gratuito</span><h4>${esc(text || "Controllo le foto…")}</h4><p>Le foto restano sul telefono. Il risultato non conta davvero i bolli: ti aiuta a valutare qualità e coerenza della scheda.</p>`;
  }

  async function analyzeCurrentPointWithAi() {
    const point = editingPoint();
    if (!point) return;

    if (!activePointPhotos.length) {
      alert("Aggiungi almeno una foto della zona prima dell’analisi locale.");
      return;
    }

    setAiLoading(true, "Controllo qualità foto e coerenza della scheda…");

    try {
      const quality = await calculateLocalPhotoQuality(activePointPhotos.slice(0, MAX_PHOTOS_PER_POINT));
      const analysis = safeAnalysis(buildLocalSuggestion(point, quality));

      point.aiAnalysis = analysis;
      renderAiResult(analysis);
      scheduleDraft();
    } catch (error) {
      console.error(error);
      const holder = $("aiResult");
      holder.className = "ai-result error";
      holder.innerHTML = `<h4>Analisi locale non riuscita</h4><p>${esc(error?.message || "Errore sconosciuto")}</p><p class="small">Puoi comunque continuare manualmente con foto, note e preventivo.</p>`;
    } finally {
      setAiLoading(false);
    }
  }

  function applyAiSuggestion() {
    const point = editingPoint();
    const analysis = safeAnalysis(point?.aiAnalysis);
    if (!point || !analysis) return;

    const allowedPanels = [...$("pointPanel").options].map((option) => option.value);
    if (allowedPanels.includes(analysis.panel_suggestion)) $("pointPanel").value = analysis.panel_suggestion;
    $("pointDents").value = Math.max(1, analysis.suggested_dents);
    if (["piccola", "media", "grande"].includes(analysis.size)) $("pointSize").value = analysis.size;
    if (["lieve", "media", "forte"].includes(analysis.depth)) $("pointDepth").value = analysis.depth;
    if (["no", "si"].includes(analysis.paint)) $("pointPaint").value = analysis.paint;

    const note = `Pre-analisi locale: ${analysis.dent_count_min}–${analysis.dent_count_max} bolli, confidenza ${analysis.confidence}%. ${analysis.caution}`;
    const current = $("pointNote").value.trim();
    if (!current.includes("Pre-analisi locale:")) $("pointNote").value = current ? `${current}\n${note}` : note;
    alert("Suggerimento locale riportato nei campi. Controllalo e premi ‘Salva dettagli’ per confermarlo.");
  }

  // ---------- Motore 3D ----------

  function setModelStatus(text, type = "warning") {
    const badge = $("threeStatus");
    badge.textContent = text;
    badge.className = `status-pill ${type}`;
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
        $("modelFallback").textContent = "Il modello 3D non si è caricato. Riapri con internet attivo.";
      });

      if (viewer.loaded) {
        modelReady = true;
        $("modelFallback").classList.add("hidden");
        setModelStatus("Modello 3D pronto", "ok");
        restoreMarkers();
      }
    } catch {
      setModelStatus("Motore 3D non disponibile", "fail");
      $("modelFallback").textContent = "Il motore 3D non è disponibile. Controlla la connessione e riapri.";
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

  viewer.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.(".damage-marker")) return;
    press = { x: event.clientX, y: event.clientY, time: performance.now() };
  }, { passive: true });

  viewer.addEventListener("pointerup", (event) => {
    if (!press || !modelReady) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    const duration = performance.now() - press.time;
    press = null;

    if (moved > 10 || duration > 420 || dialog.open) return;

    try {
      const picked = viewer.positionAndNormalFromPoint?.(event.clientX, event.clientY);
      const surface = viewer.surfaceFromPoint?.(event.clientX, event.clientY);
      if (!picked && !surface) return;

      addPoint({
        surface: surface ? String(surface) : "",
        position: picked?.position?.toString?.() || "",
        normal: picked?.normal?.toString?.() || ""
      });
    } catch (error) {
      console.warn("Punto danno non letto", error);
    }
  }, { passive: true });

  const CAMERA_VIEWS = {
    front: "0deg 76deg 105%",
    rear: "180deg 76deg 105%",
    left: "-90deg 76deg 105%",
    right: "90deg 76deg 105%",
    top: "0deg 8deg 120%",
    reset: "-35deg 68deg 105%"
  };

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (modelReady) viewer.cameraOrbit = CAMERA_VIEWS[button.dataset.view] || CAMERA_VIEWS.reset;
    });
  });

  // ---------- Preventivo ----------

  function basePrice(dents) {
    if (dents <= 50) return 350;
    if (dents <= 200) return 550;
    if (dents <= 300) return 750;
    if (dents <= 550) return 950;
    return 1150;
  }

  function calculateEstimate(allowFallback = true) {
    const zoneDents = totalDents();
    const manual = Math.max(0, Number($("manualDents").value) || 0);
    const dents = zoneDents > 0 ? zoneDents : manual;

    if (!dents && !allowFallback) {
      return { dents: 0, base: 0, suggested: 0, hours: 0, modifiers: [], paintFlag: false };
    }

    const usedDents = Math.max(1, dents || 1);
    let price = basePrice(usedDents);
    let complexity = 0;
    const modifiers = [];
    const panels = selectedPanels();
    const points = state.points;

    if (panels.length === 2) {
      price *= 1.15; complexity += .25; modifiers.push("2 pannelli +15%");
    } else if (panels.length === 3) {
      price *= 1.25; complexity += .5; modifiers.push("3 pannelli +25%");
    } else if (panels.length >= 4) {
      price *= 1.40; complexity += .8; modifiers.push("4+ pannelli +40%");
    }

    if (panels.includes("Tetto")) {
      price *= 1.15; complexity += .35; modifiers.push("Tetto +15%");
    }

    if (panels.includes("Fiancata sinistra") || panels.includes("Fiancata destra")) {
      price *= 1.10; complexity += .25; modifiers.push("Fiancata +10%");
    }

    const hasLarge = points.some((point) => point.size === "grande") || (!points.length && $("globalSize").value === "grande");
    const hasMedium = points.some((point) => point.size === "media") || (!points.length && $("globalSize").value === "media");
    if (hasLarge) {
      price *= 1.25; complexity += .5; modifiers.push("Bolli grandi +25%");
    } else if (hasMedium) {
      price *= 1.10; complexity += .2; modifiers.push("Bolli medi +10%");
    }

    const strongDepth = points.some((point) => point.depth === "forte");
    const mediumDepth = points.some((point) => point.depth === "media");
    if (strongDepth) {
      price *= 1.12; complexity += .6; modifiers.push("Profondità forte +12%");
    } else if (mediumDepth) {
      price *= 1.05; complexity += .25; modifiers.push("Profondità media +5%");
    }

    const difficulty = $("difficulty").value;
    if (difficulty === "difficile") {
      price *= 1.15; complexity += .5; modifiers.push("Difficoltà generale +15%");
    } else if (difficulty === "molto_difficile") {
      price *= 1.30; complexity += 1; modifiers.push("Difficoltà generale +30%");
    }

    const paintFlag = points.some((point) => point.paint === "si") || $("globalPaint").value === "si";
    if (paintFlag) modifiers.push("Vernice da valutare a parte");

    const hours = Math.max(.5, Math.round((usedDents / 35 + points.length * .22 + complexity) * 2) / 2);
    return {
      dents: usedDents,
      base: basePrice(usedDents),
      suggested: Math.round(price / 10) * 10,
      hours,
      modifiers,
      paintFlag
    };
  }

  function renderQuote(force = false) {
    const estimate = calculateEstimate();
    if (!force && !estimate.dents) return estimate;

    state.lastQuote = estimate;
    $("quoteBox").classList.remove("hidden");
    $("suggestedPrice").textContent = `${estimate.suggested}€`;
    $("estimatedHours").textContent = `${estimate.hours} h`;
    $("quoteDents").textContent = String(estimate.dents);

    const breakdown = $("quoteBreakdown");
    breakdown.innerHTML = "";
    [`Base ${estimate.base}€`, ...estimate.modifiers].forEach((text) => {
      const chip = document.createElement("span");
      chip.textContent = text;
      breakdown.appendChild(chip);
    });

    if (!$("finalPrice").value || force) $("finalPrice").value = estimate.suggested;
    updateDashboard();
    scheduleDraft();
    return estimate;
  }

  function currentFinalPrice() {
    const estimate = state.lastQuote || calculateEstimate();
    const value = Number($("finalPrice").value);
    return Number.isFinite(value) && value >= 0 ? value : estimate.suggested;
  }

  // ---------- Pratica, archivio e testo ----------

  function pointText(point, index) {
    const p = normalizePoint(point);
    return `${index + 1}. ${p.panel}${p.zone ? ` (${p.zone})` : ""}: ${p.dents} boll${p.dents === 1 ? "o" : "i"} ${p.size}, profondità ${p.depth}, vernice ${p.paint === "si" ? "danneggiata" : "integra"}, ${p.photoCount} foto${p.note ? `, nota: ${p.note}` : ""}`;
  }

  function makeCaseObject() {
    const estimate = state.lastQuote || calculateEstimate();
    const form = getForm();
    const now = new Date().toISOString();

    return {
      id: state.id || `case-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      caseId: state.caseId,
      createdAt: state.createdAt || now,
      updatedAt: now,
      form,
      points: state.points.map((point) => ({ ...point })),
      quote: {
        ...estimate,
        finalPrice: currentFinalPrice()
      }
    };
  }

  function summaryText(caseData = makeCaseObject()) {
    const form = caseData.form || {};
    const quote = caseData.quote || {};
    const points = caseData.points || [];

    return `DentVision AI · ${caseData.caseId}
Stato: ${form.status || "Nuova"} · Priorità: ${form.priority || "Normale"}

CLIENTE
${form.clientName || "Cliente non indicato"}
Tel: ${form.phone || "N/D"}${form.email ? ` · Email: ${form.email}` : ""}

VEICOLO
${form.carModel || "Auto non indicata"} · ${form.plate || "Targa N/D"}
Città: ${form.city || "N/D"}
Evento: ${form.eventDate || "N/D"}${form.insurer ? ` · Assicurazione: ${form.insurer}` : ""}${form.claimCode ? ` · Sinistro: ${form.claimCode}` : ""}

ZONE DANNO (${points.length})
${points.length ? points.map(pointText).join("\n") : "Nessuna zona registrata"}

PREVENTIVO
Bolli usati: ${quote.dents || 0}
Prezzo suggerito: ${quote.suggested || 0}€
Prezzo finale: ${quote.finalPrice || quote.suggested || 0}€
Tempo indicativo: ${quote.hours || "—"} h
${quote.paintFlag ? "Vernice: da valutare a parte\n" : ""}${(quote.modifiers || []).length ? `Modifiche: ${(quote.modifiers || []).join(", ")}\n` : ""}

PROSSIMA AZIONE
${form.nextAction || "Nessuna"}

NOTE
${form.caseNotes || "Nessuna"}`;
  }

  function statusChip(status) {
    const cls = STATUS_CLASS[status] || "nuova";
    return `<span class="status-chip ${cls}">${esc(status || "Nuova")}</span>`;
  }

  function renderArchive() {
    const query = $("search").value.trim().toLowerCase();
    const status = $("statusFilter").value;
    const holder = $("leads");
    holder.innerHTML = "";

    const cases = getCases().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    $("archiveCount").textContent = `${cases.length} pratic${cases.length === 1 ? "a" : "he"}`;

    const filtered = cases.filter((caseData) => {
      const form = caseData.form || {};
      const text = [
        caseData.caseId,
        form.clientName,
        form.phone,
        form.email,
        form.carModel,
        form.plate,
        form.city,
        form.status,
        form.nextAction,
        form.caseNotes,
        ...(caseData.points || []).map((point) => `${point.panel} ${point.zone} ${point.note}`)
      ].join(" ").toLowerCase();

      return (!query || text.includes(query)) && (!status || form.status === status);
    });

    if (!filtered.length) {
      holder.innerHTML = "<p class='hint'>Nessuna pratica trovata.</p>";
      return;
    }

    filtered.forEach((caseData) => {
      const form = caseData.form || {};
      const quote = caseData.quote || {};
      const photoCount = (caseData.points || []).reduce((sum, point) => sum + (Number(point.photoCount) || 0), 0);
      const updated = caseData.updatedAt ? new Date(caseData.updatedAt).toLocaleString("it-IT") : "N/D";

      const item = document.createElement("article");
      item.className = "lead";
      item.innerHTML = `
        <div class="lead-head">
          <div>
            <strong>${esc(form.clientName || "Cliente non indicato")}</strong> · ${esc(form.carModel || "Auto non indicata")}
            <div class="lead-meta">${esc(caseData.caseId)} · ${esc(form.city || "Città N/D")} · ${esc(form.plate || "Targa N/D")}</div>
          </div>
          ${statusChip(form.status)}
        </div>
        <div class="lead-meta">
          ${caseData.points?.length || 0} zone · ${quote.dents || 0} bolli · 📷 ${photoCount} foto · Prezzo: ${quote.finalPrice || quote.suggested || "—"}€<br>
          Priorità: ${esc(form.priority || "Normale")} · Aggiornata: ${esc(updated)}${form.nextAction ? `<br>Prossima azione: ${esc(form.nextAction)}` : ""}
        </div>
        <div class="lead-actions">
          <button type="button" data-open-case="${esc(caseData.id)}">Apri</button>
          <button type="button" data-case-wa="${esc(caseData.id)}" class="whatsapp">WhatsApp</button>
          <button type="button" data-case-print="${esc(caseData.id)}" class="secondary">PDF</button>
          <button type="button" data-delete-case="${esc(caseData.id)}" class="danger">Elimina</button>
        </div>`;

      holder.appendChild(item);
    });
  }

  async function saveCurrentCase() {
    const form = getForm();

    if (!form.clientName.trim()) {
      alert("Scrivi almeno il nome del cliente.");
      $("clientName").focus();
      return null;
    }
    if (!form.carModel.trim()) {
      alert("Scrivi almeno marca e modello dell'auto.");
      $("carModel").focus();
      return null;
    }

    const data = makeCaseObject();
    const cases = getCases();
    const index = cases.findIndex((item) => item.id === data.id);

    if (index >= 0) cases[index] = data;
    else cases.unshift(data);

    putCases(cases);
    state.id = data.id;
    state.createdAt = data.createdAt;
    state.updatedAt = data.updatedAt;
    saveDraft();
    renderArchive();
    alert(index >= 0 ? "Pratica aggiornata." : "Pratica salvata.");
    return data;
  }

  function openCase(id) {
    const caseData = getCases().find((item) => item.id === id);
    if (!caseData) return;

    state = {
      id: caseData.id,
      caseId: caseData.caseId || freshCaseId(),
      createdAt: caseData.createdAt || new Date().toISOString(),
      updatedAt: caseData.updatedAt || new Date().toISOString(),
      points: Array.isArray(caseData.points) ? caseData.points.map(normalizePoint) : [],
      lastQuote: caseData.quote || null
    };

    applyForm(caseData.form || {});
    updateCaseHeader();
    restoreMarkers();
    refreshDamageUI();

    if (state.lastQuote) {
      $("quoteBox").classList.remove("hidden");
      $("suggestedPrice").textContent = `${state.lastQuote.suggested || 0}€`;
      $("estimatedHours").textContent = `${state.lastQuote.hours || "—"} h`;
      $("quoteDents").textContent = String(state.lastQuote.dents || 0);
      $("finalPrice").value = state.lastQuote.finalPrice ?? state.lastQuote.suggested ?? "";
      const breakdown = $("quoteBreakdown");
      breakdown.innerHTML = "";
      [`Base ${state.lastQuote.base || 0}€`, ...(state.lastQuote.modifiers || [])].forEach((text) => {
        const chip = document.createElement("span");
        chip.textContent = text;
        breakdown.appendChild(chip);
      });
    } else {
      $("quoteBox").classList.add("hidden");
    }

    saveDraft();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function newCase() {
    const currentPoints = [...state.points];

    if (!confirm("Vuoi iniziare una nuova pratica? La bozza attuale non salvata verrà eliminata.")) return;

    if (!state.id && currentPoints.length) {
      await removePhotosForPointIds(currentPoints.map((point) => point.id));
    }

    state = freshState();
    FORM_IDS.forEach((id) => { $(id).value = ""; });
    restoreDefaults();
    $("quoteBox").classList.add("hidden");
    updateCaseHeader();
    restoreMarkers();
    refreshDamageUI();
    saveDraft();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- PDF e condivisione ----------

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("Errore conversione foto"));
      reader.readAsDataURL(blob);
    });
  }

  async function prepareReportPhotos(points) {
    const result = [];

    for (const point of points || []) {
      try {
        const photos = await getPointPhotos(point.id);
        const images = [];
        for (const photo of photos.slice(0, MAX_PHOTOS_PER_POINT)) {
          try {
            images.push(await blobToDataUrl(photo.blob));
          } catch {
            // skip damaged image
          }
        }
        result.push({ pointId: point.id, images });
      } catch {
        result.push({ pointId: point.id, images: [] });
      }
    }

    return result;
  }

  function reportHtml(caseData, photosByPoint) {
    const form = caseData.form || {};
    const quote = caseData.quote || {};
    const photoMap = new Map(photosByPoint.map((item) => [item.pointId, item.images || []]));
    const date = new Date(caseData.updatedAt || Date.now()).toLocaleString("it-IT");

    const zones = (caseData.points || []).map((point, index) => {
      const images = photoMap.get(point.id) || [];
      return `<section class="zone">
        <h3>${index + 1}. ${esc(point.panel)}${point.zone ? ` · ${esc(point.zone)}` : ""}</h3>
        <p><b>${point.dents} boll${point.dents === 1 ? "o" : "i"}</b> · ${esc(point.size)} · profondità ${esc(point.depth)} · vernice ${point.paint === "si" ? "da valutare" : "integra"} · ${point.photoCount || 0} foto</p>
        ${point.note ? `<p class="note"><b>Nota:</b> ${esc(point.note)}</p>` : ""}
        ${images.length ? `<div class="photos">${images.map((image, n) => `<img src="${image}" alt="Foto zona ${index + 1}-${n + 1}">`).join("")}</div>` : ""}
      </section>`;
    }).join("") || "<p>Nessuna zona danno registrata.</p>";

    return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Report ${esc(caseData.caseId)}</title>
<style>
*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#142033;margin:0;background:#f4f7fb}.page{max-width:900px;margin:0 auto;background:#fff;padding:34px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #139be2;padding-bottom:18px}.brand{color:#139be2;font-weight:800;letter-spacing:.08em}.title{font-size:30px;margin:8px 0}.muted{color:#52657a;line-height:1.4}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:22px 0}.box{border:1px solid #d8e1ec;border-radius:12px;padding:14px;background:#fbfdff}.box b{display:block;color:#52657a;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}.quote{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0}.quote .box strong{font-size:25px;color:#0d7ebd}.zone{border:1px solid #d8e1ec;border-radius:14px;padding:15px;margin:13px 0;break-inside:avoid}.zone h3{margin:0 0 8px;font-size:18px}.zone p{line-height:1.45;margin:7px 0}.note{background:#f5f9fd;padding:9px;border-radius:8px}.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.photos img{width:100%;height:150px;object-fit:cover;border-radius:8px;border:1px solid #d8e1ec}@media print{body{background:#fff}.page{max-width:none;padding:0}.no-print{display:none}}@media(max-width:600px){.grid,.quote{grid-template-columns:1fr}.photos{grid-template-columns:repeat(2,1fr)}}
</style></head>
<body><main class="page">
<div class="head"><div><div class="brand">DENTVISION AI · REPORT PDR</div><h1 class="title">Stima danni grandine</h1><div class="muted">Pratica ${esc(caseData.caseId)} · aggiornato ${esc(date)}</div></div><div class="muted">${statusChip(form.status).replace(/<[^>]+>/g, "")}<br>Priorità: ${esc(form.priority || "Normale")}</div></div>
<div class="grid">
<div class="box"><b>Cliente</b>${esc(form.clientName || "N/D")}<br>${esc(form.phone || "")}${form.email ? `<br>${esc(form.email)}` : ""}</div>
<div class="box"><b>Veicolo</b>${esc(form.carModel || "N/D")}<br>${esc(form.plate || "")}<br>${esc(form.city || "")}</div>
<div class="box"><b>Evento</b>${esc(form.eventDate || "Non indicata")}<br>${form.insurer ? `Assicurazione: ${esc(form.insurer)}` : ""}${form.claimCode ? `<br>Sinistro: ${esc(form.claimCode)}` : ""}</div>
<div class="box"><b>Prossima azione</b>${esc(form.nextAction || "Nessuna")}</div>
</div>
<div class="quote">
<div class="box"><b>Bolli usati</b><strong>${esc(quote.dents || 0)}</strong></div>
<div class="box"><b>Prezzo suggerito</b><strong>${esc(quote.suggested || 0)}€</strong></div>
<div class="box"><b>Prezzo finale</b><strong>${esc(quote.finalPrice || quote.suggested || 0)}€</strong><div class="muted">Tempo indicativo: ${esc(quote.hours || "—")} h</div></div>
</div>
<h2>Zone danno</h2>${zones}
<h2>Note generali</h2><p class="muted">${esc(form.caseNotes || "Nessuna nota generale.")}</p>
<p class="muted">Report generato da DentVision AI. Preventivo indicativo da confermare dopo sopralluogo.</p>
</main><script>setTimeout(()=>window.print(),700)<\/script></body></html>`;
  }

  async function printCase(caseData = makeCaseObject()) {
    const popup = window.open("", "_blank");
    if (!popup) {
      alert("Il browser ha bloccato la finestra del report. Consenti popup per questo sito e riprova.");
      return;
    }

    popup.document.write("<p style='font-family:Arial;padding:24px'>Preparazione report e foto…</p>");
    popup.document.close();

    const photos = await prepareReportPhotos(caseData.points || []);
    popup.document.open();
    popup.document.write(reportHtml(caseData, photos));
    popup.document.close();
  }

  async function copyText() {
    const text = summaryText();

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    alert("Riepilogo copiato.");
  }

  function shareWhatsApp(caseData = makeCaseObject()) {
    const text = summaryText(caseData);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportJson() {
    const payload = {
      app: "DentVision AI",
      version: "2.0",
      exportedAt: new Date().toISOString(),
      note: "Le foto non sono incluse. Restano salvate localmente nel browser originale.",
      cases: getCases()
    };
    downloadFile(`dentvision-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    const rows = [
      ["ID pratica", "Stato", "Priorità", "Cliente", "Telefono", "Auto", "Targa", "Città", "Zone", "Bolli", "Foto", "Prezzo finale", "Aggiornata"]
    ];

    getCases().forEach((caseData) => {
      const form = caseData.form || {};
      const quote = caseData.quote || {};
      const photos = (caseData.points || []).reduce((sum, point) => sum + (Number(point.photoCount) || 0), 0);
      rows.push([
        caseData.caseId,
        form.status,
        form.priority,
        form.clientName,
        form.phone,
        form.carModel,
        form.plate,
        form.city,
        (caseData.points || []).length,
        quote.dents,
        photos,
        quote.finalPrice || quote.suggested,
        caseData.updatedAt ? new Date(caseData.updatedAt).toLocaleString("it-IT") : ""
      ]);
    });

    const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    downloadFile(`dentvision-elenco-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  }

  async function importBackup(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = Array.isArray(parsed) ? parsed : parsed.cases;

      if (!Array.isArray(imported)) throw new Error("Formato backup non valido.");

      const current = getCases();
      const map = new Map(current.map((item) => [item.id, item]));

      imported.forEach((item) => {
        if (!item || !item.id) return;
        map.set(item.id, item);
      });

      putCases([...map.values()]);
      renderArchive();
      alert(`Importate o aggiornate ${imported.length} pratiche. Le foto non sono incluse nel backup.`);
    } catch (error) {
      console.error(error);
      alert("Backup non valido o non leggibile.");
    }
  }

  // ---------- Eventi ----------

  function bindEvents() {
    FORM_IDS.forEach((id) => {
      $(id).addEventListener("input", () => {
        if (id === "status") updateDashboard();
        scheduleDraft();
      });
      $(id).addEventListener("change", () => {
        if (id === "status") updateDashboard();
        scheduleDraft();
      });
    });

    $("newCase").addEventListener("click", () => void newCase());
    $("saveCaseTop").addEventListener("click", () => void saveCurrentCase());
    $("saveCase").addEventListener("click", () => void saveCurrentCase());

    $("undoPoint").addEventListener("click", async () => {
      const point = state.points.pop();
      if (!point) return;
      await removePhotosForPointIds([point.id]);
      restoreMarkers();
      refreshDamageUI();
    });

    $("clearPoints").addEventListener("click", async () => {
      if (!state.points.length || !confirm("Vuoi cancellare tutte le zone danno e le loro foto?")) return;
      const ids = state.points.map((point) => point.id);
      state.points = [];
      await removePhotosForPointIds(ids);
      restoreMarkers();
      refreshDamageUI();
    });

    $("damageList").addEventListener("click", async (event) => {
      const edit = event.target.closest("[data-edit-point]");
      const remove = event.target.closest("[data-remove-point]");

      if (edit) void openPointDialog(Number(edit.dataset.editPoint), false);

      if (remove) {
        const index = Number(remove.dataset.removePoint);
        const [point] = state.points.splice(index, 1);
        if (point) await removePhotosForPointIds([point.id]);
        restoreMarkers();
        refreshDamageUI();
      }
    });

    $("savePointEdit").addEventListener("click", savePointDialog);
    $("cancelPointEdit").addEventListener("click", () => void closePointDialog(true));
    $("closeDamageDialog").addEventListener("click", () => void closePointDialog(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      void closePointDialog(true);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) void closePointDialog(true);
    });

    $("pointGalleryPhotos").addEventListener("change", (event) => {
      void addPointPhotos(event.target.files);
      event.target.value = "";
    });

    $("pointCameraPhotos").addEventListener("change", (event) => {
      void addPointPhotos(event.target.files);
      event.target.value = "";
    });

    $("pointPhotoPreview").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-point-photo]");
      if (remove) void removeCurrentPointPhoto(remove.dataset.removePointPhoto);
    });

    $("clearPointPhotos").addEventListener("click", () => void clearCurrentPointPhotos());
    $("checkPointPhotos").addEventListener("click", () => void checkCurrentPointPhotos());
    $("analyzePointAi").addEventListener("click", () => void analyzeCurrentPointWithAi());
    $("aiResult").addEventListener("click", (event) => {
      if (event.target.closest("#applyAiSuggestion")) applyAiSuggestion();
    });

    $("calculateQuote").addEventListener("click", () => renderQuote(true));
    $("useZonesTotal").addEventListener("click", () => {
      const dents = totalDents();
      if (!dents) {
        alert("Prima inserisci almeno una zona danno.");
        return;
      }
      $("manualDents").value = dents;
      renderQuote(true);
    });

    $("finalPrice").addEventListener("input", () => {
      scheduleDraft();
      updateDashboard();
    });

    $("shareWhatsApp").addEventListener("click", () => shareWhatsApp());
    $("copySummary").addEventListener("click", () => void copyText());
    $("printReport").addEventListener("click", () => void printCase());

    $("search").addEventListener("input", renderArchive);
    $("statusFilter").addEventListener("change", renderArchive);

    $("leads").addEventListener("click", async (event) => {
      const open = event.target.closest("[data-open-case]");
      const wa = event.target.closest("[data-case-wa]");
      const print = event.target.closest("[data-case-print]");
      const del = event.target.closest("[data-delete-case]");

      if (open) openCase(open.dataset.openCase);

      if (wa) {
        const caseData = getCases().find((item) => item.id === wa.dataset.caseWa);
        if (caseData) shareWhatsApp(caseData);
      }

      if (print) {
        const caseData = getCases().find((item) => item.id === print.dataset.casePrint);
        if (caseData) void printCase(caseData);
      }

      if (del) {
        const id = del.dataset.deleteCase;
        const caseData = getCases().find((item) => item.id === id);
        if (!caseData || !confirm("Eliminare questa pratica e le foto locali collegate?")) return;

        await removePhotosForPointIds((caseData.points || []).map((point) => point.id));
        putCases(getCases().filter((item) => item.id !== id));
        renderArchive();
      }
    });

    $("exportJson").addEventListener("click", exportJson);
    $("exportCsv").addEventListener("click", exportCsv);
    $("importBackup").addEventListener("change", (event) => {
      void importBackup(event.target.files?.[0]);
      event.target.value = "";
    });
  }

  function boot() {
    restoreDraft();
    updateCaseHeader();
    bindEvents();
    restoreMarkers();
    refreshDamageUI();
    renderArchive();
    updateDashboard();

    if (state.lastQuote) {
      $("quoteBox").classList.remove("hidden");
      $("suggestedPrice").textContent = `${state.lastQuote.suggested || 0}€`;
      $("estimatedHours").textContent = `${state.lastQuote.hours || "—"} h`;
      $("quoteDents").textContent = String(state.lastQuote.dents || 0);
      $("finalPrice").value = state.lastQuote.finalPrice ?? state.lastQuote.suggested ?? "";
      const breakdown = $("quoteBreakdown");
      breakdown.innerHTML = "";
      [`Base ${state.lastQuote.base || 0}€`, ...(state.lastQuote.modifiers || [])].forEach((text) => {
        const chip = document.createElement("span");
        chip.textContent = text;
        breakdown.appendChild(chip);
      });
    }

    saveDraft();
  }

  boot();
})();
