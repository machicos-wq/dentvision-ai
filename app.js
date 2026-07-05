// DentVision AI v1.7.6
// Auto 3D offline migliorata: più pannelli e forma più "automobile".

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORE = "dentvision_leads";
  const canvas = $("carCanvas");
  const ctx = canvas.getContext("2d");
  let width = 1, height = 1, dpr = 1;

  let yaw = 2.44;
  let pitch = -0.26;
  let zoom = 1.03;
  let drag = null;
  let pinchStart = null;
  let points3d = [];
  let selectedPanels = [];
  let latestEstimate = null;
  let editIndex = null;
  let previewUrls = [];
  // Le foto vengono gestite in un array separato: così galleria e fotocamera
  // possono aggiungere immagini alla stessa pratica senza dipendere dal FileList del browser.
  let selectedPhotoFiles = [];

  // Geometria "berlina" più slanciata.
  // x = sinistra/destra, y = altezza, z = anteriore/posteriore.
  const panelDefs = [
    { name: "Cofano", color: "#2a85e8", verts: [[-0.94,1.17,-2.26],[0.94,1.17,-2.26],[0.80,1.39,-0.88],[-0.80,1.39,-0.88]] },
    { name: "Tetto", color: "#3f96f6", verts: [[-0.73,1.94,-0.58],[0.73,1.94,-0.58],[0.66,1.91,0.88],[-0.66,1.91,0.88]] },
    { name: "Baule", color: "#2a85e8", verts: [[-0.79,1.36,0.98],[0.79,1.36,0.98],[0.94,1.16,2.22],[-0.94,1.16,2.22]] },
    { name: "Fiancata sinistra", color: "#205fae", verts: [[-1.13,0.68,-1.53],[-1.13,1.28,-1.43],[-1.13,1.31,1.48],[-1.13,0.69,1.48]] },
    { name: "Fiancata destra", color: "#205fae", verts: [[1.13,0.68,-1.53],[1.13,1.28,-1.43],[1.13,1.31,1.48],[1.13,0.69,1.48]] },
    { name: "Parafango anteriore sinistro", color: "#2672c9", verts: [[-1.15,0.72,-2.18],[-1.15,1.18,-2.13],[-1.15,1.28,-1.48],[-1.15,0.70,-1.48]] },
    { name: "Parafango anteriore destro", color: "#2672c9", verts: [[1.15,0.72,-2.18],[1.15,1.18,-2.13],[1.15,1.28,-1.48],[1.15,0.70,-1.48]] },
    { name: "Parafango posteriore sinistro", color: "#2672c9", verts: [[-1.15,0.70,1.48],[-1.15,1.28,1.48],[-1.15,1.18,2.13],[-1.15,0.72,2.18]] },
    { name: "Parafango posteriore destro", color: "#2672c9", verts: [[1.15,0.70,1.48],[1.15,1.28,1.48],[1.15,1.18,2.13],[1.15,0.72,2.18]] }
  ];

  const bodyFaces = [
    // Scocca inferiore e paraurti
    { color:"#132f58", verts:[[-1.10,.52,-2.12],[1.10,.52,-2.12],[1.10,.52,2.12],[-1.10,.52,2.12]] },
    { color:"#174f91", verts:[[-1.04,.58,-2.30],[1.04,.58,-2.30],[.96,1.12,-2.20],[-.96,1.12,-2.20]] },
    { color:"#143e73", verts:[[-1.08,.50,-2.34],[1.08,.50,-2.34],[1.05,.71,-2.27],[-1.05,.71,-2.27]] },
    { color:"#174f91", verts:[[-1.04,.58,2.30],[1.04,.58,2.30],[.96,1.10,2.20],[-.96,1.10,2.20]] },
    { color:"#143e73", verts:[[-1.08,.50,2.34],[1.08,.50,2.34],[1.05,.71,2.27],[-1.05,.71,2.27]] },

    // Fianchi sotto i pannelli
    { color:"#174f91", verts:[[-1.11,.57,-1.60],[-1.11,.87,-1.56],[-1.11,.88,1.52],[-1.11,.58,1.52]] },
    { color:"#174f91", verts:[[1.11,.57,-1.60],[1.11,.87,-1.56],[1.11,.88,1.52],[1.11,.58,1.52]] },

    // Cabina rastremata, parabrezza e lunotto
    { color:"#0b1e36", verts:[[-.82,1.30,-1.16],[.82,1.30,-1.16],[.74,1.86,-.10],[-.74,1.86,-.10]] },
    { color:"#79d0fa", alpha:.44, verts:[[-.74,1.37,-1.06],[.74,1.37,-1.06],[.65,1.78,-.15],[-.65,1.78,-.15]] },
    { color:"#0b1e36", verts:[[-.75,1.85,-.05],[.75,1.85,-.05],[.68,1.82,.93],[-.68,1.82,.93]] },
    { color:"#79d0fa", alpha:.40, verts:[[-.64,1.76,.03],[.64,1.76,.03],[.57,1.70,.81],[-.57,1.70,.81]] },
    { color:"#0b1e36", verts:[[-.75,1.28,.99],[.75,1.28,.99],[.64,1.68,.86],[-.64,1.68,.86]] },

    // Porte, montanti e linee laterali
    { color:"#1a4f91", verts:[[-1.11,.89,-1.39],[-1.11,1.25,-1.35],[-1.11,1.30,1.35],[-1.11,.90,1.39]] },
    { color:"#1a4f91", verts:[[1.11,.89,-1.39],[1.11,1.25,-1.35],[1.11,1.30,1.35],[1.11,.90,1.39]] },
    { color:"#254f86", verts:[[-1.125,.94,-.20],[-1.125,1.24,-.17],[-1.125,1.26,-.08],[-1.125,.95,-.10]] },
    { color:"#254f86", verts:[[1.125,.94,-.20],[1.125,1.24,-.17],[1.125,1.26,-.08],[1.125,.95,-.10]] },

    // Specchietti
    { color:"#0f243e", verts:[[-1.24,1.27,-.92],[-1.08,1.27,-.92],[-1.08,1.35,-.78],[-1.24,1.35,-.78]] },
    { color:"#0f243e", verts:[[1.24,1.27,-.92],[1.08,1.27,-.92],[1.08,1.35,-.78],[1.24,1.35,-.78]] }
  ];

  const accentFaces = [
    // fari, calandra e targa
    { color:"#d9f4ff", verts:[[-.84,.86,-2.29],[-.54,.86,-2.28],[-.54,1.01,-2.22],[-.84,1.01,-2.23]], alpha:.94 },
    { color:"#d9f4ff", verts:[[.54,.86,-2.28],[.84,.86,-2.29],[.84,1.01,-2.23],[.54,1.01,-2.22]], alpha:.94 },
    { color:"#061526", verts:[[-.42,.72,-2.34],[.42,.72,-2.34],[.42,.91,-2.25],[-.42,.91,-2.25]], alpha:.98 },
    { color:"#e2e8f0", verts:[[-.28,.65,-2.35],[.28,.65,-2.35],[.28,.76,-2.30],[-.28,.76,-2.30]], alpha:.94 },

    // luci posteriori e targa
    { color:"#f04456", verts:[[-.82,.84,2.29],[-.52,.84,2.28],[-.52,.98,2.22],[-.82,.98,2.23]], alpha:.96 },
    { color:"#f04456", verts:[[.52,.84,2.28],[.82,.84,2.29],[.82,.98,2.23],[.52,.98,2.22]], alpha:.96 },
    { color:"#e2e8f0", verts:[[-.28,.65,2.35],[.28,.65,2.35],[.28,.76,2.30],[-.28,.76,2.30]], alpha:.94 },

    // maniglie
    { color:"#a7dffa", verts:[[-1.14,1.02,-.64],[-1.14,1.08,-.64],[-1.14,1.08,-.42],[-1.14,1.02,-.42]], alpha:.75 },
    { color:"#a7dffa", verts:[[1.14,1.02,-.64],[1.14,1.08,-.64],[1.14,1.08,-.42],[1.14,1.02,-.42]], alpha:.75 },
    { color:"#a7dffa", verts:[[-1.14,1.02,.58],[-1.14,1.08,.58],[-1.14,1.08,.80],[-1.14,1.02,.80]], alpha:.75 },
    { color:"#a7dffa", verts:[[1.14,1.02,.58],[1.14,1.08,.58],[1.14,1.08,.80],[1.14,1.02,.80]], alpha:.75 }
  ];

  const wheels = [
    [-1.16,.50,-1.48], [1.16,.50,-1.48], [-1.16,.50,1.48], [1.16,.50,1.48]
  ];

  function rotate3D(v) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = v[0] * cy - v[2] * sy;
    const z1 = v[0] * sy + v[2] * cy;
    const y2 = v[1] * cp - z1 * sp;
    const z2 = v[1] * sp + z1 * cp;
    return [x1, y2, z2];
  }

  function project(v) {
    const r = rotate3D(v);
    const distance = 9.6;
    const scale = Math.min(width, height) * 0.85 * zoom;
    const perspective = scale / (distance - r[2]);
    return { x: width / 2 + r[0] * perspective, y: height * 0.60 - r[1] * perspective, z: r[2] };
  }

  function avgDepth(verts) {
    return verts.reduce((sum, v) => sum + rotate3D(v)[2], 0) / verts.length;
  }

  function drawPolygon(vertices, fill, alpha = 1, border = "#3ab8ff", borderW = 1.6) {
    const p = vertices.map(project);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = border;
    ctx.lineWidth = borderW * dpr;
    ctx.stroke();
    ctx.restore();
    return p;
  }

  function drawWheel(pos) {
    const p = project(pos);
    const r = Math.max(9, Math.min(width, height) * .060 * zoom / (1 - p.z / 11));
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.lineWidth = 2.4 * dpr;
    ctx.strokeStyle = "#334155";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r * .60, 0, Math.PI * 2);
    ctx.fillStyle = "#1f2937";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r * .30, 0, Math.PI * 2);
    ctx.fillStyle = "#94a3b8";
    ctx.fill();
    ctx.restore();
  }

  function drawShadow() {
    const grd = ctx.createRadialGradient(width / 2, height * 0.78, 30, width / 2, height * 0.78, width * 0.28);
    grd.addColorStop(0, "rgba(0,0,0,.46)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(width / 2, height * 0.80, width * 0.26, height * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMarker(marker) {
    const p = project(marker.position);
    const radius = Math.max(6, Math.min(width, height) * .017 * zoom / (1 - p.z / 11));
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444";
    ctx.fill();
    ctx.lineWidth = 2 * dpr;
    ctx.strokeStyle = "#fee2e2";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius * 1.8, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(239,68,68,.50)";
    ctx.stroke();
    ctx.restore();
  }

  function drawCar() {
    ctx.clearRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width / 2, height * .20, 10, width / 2, height * .25, Math.max(width, height) * .65);
    glow.addColorStop(0, "rgba(80,160,220,.22)");
    glow.addColorStop(1, "rgba(5,11,20,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    drawShadow();

    const faces = [
      ...bodyFaces.map(face => ({ ...face, selectable: false })),
      ...panelDefs.map(face => ({ ...face, selectable: true })),
      ...accentFaces.map(face => ({ ...face, selectable: false }))
    ].sort((a, b) => avgDepth(a.verts) - avgDepth(b.verts));

    faces.forEach(face => {
      const selected = selectedPanels.includes(face.name);
      const border = selected ? "#22c55e" : (face.selectable ? "#62c6ff" : "rgba(100,200,255,.28)");
      const fill = selected ? "#1d7246" : face.color;
      const borderW = face.selectable ? 1.8 : 1.1;
      drawPolygon(face.verts, fill, face.alpha ?? 1, border, borderW);
    });

    wheels.sort((a, b) => rotate3D(a)[2] - rotate3D(b)[2]).forEach(drawWheel);
    points3d.forEach(drawMarker);

    ctx.save();
    ctx.fillStyle = "rgba(229,231,235,.72)";
    ctx.font = `${Math.max(12, Math.round(Math.min(width, height) * .036))}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText("Ruota · zooma · tocca un pannello", width / 2, height - 18 * dpr);
    ctx.restore();
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width * dpr));
    height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
    drawCar();
  }

  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function barycentric(point, a, b, c) {
    const v0 = { x: b.x - a.x, y: b.y - a.y };
    const v1 = { x: c.x - a.x, y: c.y - a.y };
    const v2 = { x: point.x - a.x, y: point.y - a.y };
    const d00 = v0.x * v0.x + v0.y * v0.y;
    const d01 = v0.x * v1.x + v0.y * v1.y;
    const d11 = v1.x * v1.x + v1.y * v1.y;
    const d20 = v2.x * v0.x + v2.y * v0.y;
    const d21 = v2.x * v1.x + v2.y * v1.y;
    const denom = d00 * d11 - d01 * d01 || 1;
    const v = (d11 * d20 - d01 * d21) / denom;
    const w = (d00 * d21 - d01 * d20) / denom;
    return [1 - v - w, v, w];
  }

  function worldFromTap(face, screenPoint, projected) {
    const triangles = [[0, 1, 2], [0, 2, 3]];
    for (const tri of triangles) {
      const a = projected[tri[0]], b = projected[tri[1]], c = projected[tri[2]];
      if (pointInPolygon(screenPoint.x, screenPoint.y, [a, b, c])) {
        const w = barycentric(screenPoint, a, b, c);
        const va = face.verts[tri[0]], vb = face.verts[tri[1]], vc = face.verts[tri[2]];
        return [
          va[0] * w[0] + vb[0] * w[1] + vc[0] * w[2],
          va[1] * w[0] + vb[1] * w[1] + vc[1] * w[2],
          va[2] * w[0] + vb[2] * w[1] + vc[2] * w[2]
        ];
      }
    }
    return face.verts[0];
  }

  function hitPanel(x, y) {
    const ordered = [...panelDefs].sort((a, b) => avgDepth(b.verts) - avgDepth(a.verts));
    for (const face of ordered) {
      const projected = face.verts.map(project);
      if (pointInPolygon(x, y, projected)) {
        return { face, position: worldFromTap(face, { x, y }, projected) };
      }
    }
    return null;
  }

  function zoneOf(panel, p) {
    const side = p[0] < -0.30 ? "lato SX" : p[0] > 0.30 ? "lato DX" : "centro";
    const depth = p[2] < -0.60 ? "zona anteriore" : p[2] > 0.60 ? "zona posteriore" : "zona centrale";
    return `${panel} · ${side}, ${depth}`;
  }

  function addPoint(panel, position) {
    points3d.push({
      id: `d-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      panel,
      position: position.map(n => Number(n.toFixed(3))),
      zone: zoneOf(panel, position)
    });
    selectedPanels = [...new Set([...selectedPanels, panel])];
    renderDamageInfo();
    drawCar();
  }

  function renderDamageInfo() {
    const n = points3d.length;
    $("pointCount").textContent = `${n} punt${n === 1 ? "o" : "i"} danno segnat${n === 1 ? "o" : "i"}`;
    $("panelSummary").textContent = `Pannelli: ${selectedPanels.length ? selectedPanels.join(", ") : "nessuno"}`;
    const list = $("damageList");
    list.innerHTML = "";
    if (!n) {
      list.innerHTML = "<p class='hint'>Nessun punto ancora. Ruota l’auto, fai zoom e tocca la zona danneggiata.</p>";
      return;
    }
    points3d.forEach((p, index) => {
      const item = document.createElement("div");
      item.className = "damage-item";
      item.innerHTML = `<div><strong>Punto ${index + 1} · ${esc(p.panel)}</strong><span>${esc(p.zone)}</span></div><button type="button" data-remove="${index}">Rimuovi</button>`;
      list.appendChild(item);
    });
  }

  function setView(view) {
    const states = {
      front: [Math.PI, -0.18, 1.18],
      rear: [0, -0.18, 1.18],
      left: [-Math.PI / 2, -0.16, 1.14],
      right: [Math.PI / 2, -0.16, 1.14],
      top: [-0.03, -1.02, 1.00],
      reset: [2.44, -0.26, 1.03]
    };
    const next = states[view] || states.reset;
    const from = { yaw, pitch, zoom }, start = performance.now(), duration = 320;
    function animate(now) {
      const t = Math.min(1, (now - start) / duration), e = 1 - Math.pow(1 - t, 3);
      yaw = from.yaw + (next[0] - from.yaw) * e;
      pitch = from.pitch + (next[1] - from.pitch) * e;
      zoom = from.zoom + (next[2] - from.zoom) * e;
      drawCar();
      if (t < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  function getCanvasPoint(event) {
    const r = canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) * dpr, y: (event.clientY - r.top) * dpr };
  }

  function bind3D() {
    const active = new Map();

    canvas.addEventListener("pointerdown", e => {
      canvas.setPointerCapture?.(e.pointerId);
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 1) {
        const p = getCanvasPoint(e);
        drag = { x: e.clientX, y: e.clientY, px: p.x, py: p.y, moved: false, time: performance.now() };
      } else if (active.size === 2) {
        const a = [...active.values()];
        pinchStart = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        drag = null;
      }
    });

    canvas.addEventListener("pointermove", e => {
      if (!active.has(e.pointerId)) return;
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (active.size === 2) {
        const a = [...active.values()];
        const dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        if (pinchStart) {
          zoom = Math.max(0.67, Math.min(1.95, zoom * (dist / pinchStart)));
          pinchStart = dist;
          drawCar();
        }
        return;
      }

      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 3) drag.moved = true;
        yaw += dx * .012;
        pitch = Math.max(-1.12, Math.min(.18, pitch + dy * .008));
        drag.x = e.clientX;
        drag.y = e.clientY;
        drawCar();
      }
    });

    function end(e) {
      const wasDrag = drag;
      active.delete(e.pointerId);
      if (active.size < 2) pinchStart = null;
      if (wasDrag && !wasDrag.moved && performance.now() - wasDrag.time < 420) {
        const p = getCanvasPoint(e);
        const hit = hitPanel(p.x, p.y);
        if (hit) addPoint(hit.face.name, hit.position);
      }
      if (active.size === 0) drag = null;
    }

    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", e => {
      e.preventDefault();
      zoom = Math.max(.67, Math.min(1.95, zoom * (e.deltaY > 0 ? .91 : 1.09)));
      drawCar();
    }, { passive: false });

    document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  }

  function esc(v) {
    return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function getLeads() {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; }
  }

  function putLeads(leads) { localStorage.setItem(STORE, JSON.stringify(leads)); }

  function basePrice(d) {
    if (d <= 50) return 350;
    if (d <= 200) return 550;
    if (d <= 300) return 750;
    if (d <= 550) return 950;
    return 1150;
  }

  function makeEstimate() {
    const dents = Math.max(1, Math.round(Number($("dents").value) || 1));
    let price = basePrice(dents), notes = [];
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

  function buildText(d) {
    return `DentVision AI - Nuova richiesta
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
Note: ${d.notes}`;
  }

  function renderLeads() {
    const q = $("search").value.trim().toLowerCase();
    const leads = getLeads();
    const holder = $("leads");
    holder.innerHTML = "";
    const found = leads.map((lead, index) => ({ lead, index })).filter(({ lead }) =>
      [lead.name, lead.phone, lead.plate, lead.carModel, lead.city, lead.panels].join(" ").toLowerCase().includes(q)
    );
    if (!found.length) { holder.innerHTML = "<p class='hint'>Nessuna richiesta trovata.</p>"; return; }
    found.forEach(({ lead, index }) => {
      const item = document.createElement("div");
      item.className = "lead";
      item.innerHTML = `<strong>${esc(lead.name)}</strong> · ${esc(lead.carModel)}<br>
        ${esc(lead.city)} · ${esc(lead.estimate)} · ${esc(lead.date)}<br>
        <span class="small">Tel: ${esc(lead.phone)} · Targa/Rif.: ${esc(lead.plate)} · Bolli: ${esc(lead.dents)} · Pannelli: ${esc(lead.panels)} · Punti 3D: ${(lead.damagePoints || []).length}</span>
        <div class="lead-actions"><button type="button" data-edit="${index}">Modifica</button><button type="button" class="danger" data-delete="${index}">Elimina</button><a class="whatsapp" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(buildText(lead))}">WhatsApp</a></div>`;
      holder.appendChild(item);
    });
  }

  function resetForm() {
    ["carModel", "plate", "city", "dents", "name", "phone", "finalPrice"].forEach(id => $(id).value = "");
    $("size").value = "piccola";
    $("paint").value = "no";
    $("galleryPhotos").value = "";
    $("cameraPhotos").value = "";
    clearSelectedPhotos();
    $("photoCheck").className = "photo-check hidden";
    $("result").classList.add("hidden");
    $("cancelEdit").classList.add("hidden");
    $("saveLead").textContent = "Salva richiesta";
    points3d = [];
    selectedPanels = [];
    drawCar();
    renderDamageInfo();
    latestEstimate = null;
    editIndex = null;
  }

  function loadEdit(index) {
    const d = getLeads()[index];
    if (!d) return;
    editIndex = index;
    $("carModel").value = d.carModel === "Auto non specificata" ? "" : d.carModel;
    $("plate").value = d.plate === "N/D" ? "" : d.plate;
    $("city").value = d.city === "Città non specificata" ? "" : d.city;
    $("dents").value = d.dentsValue || d.dents || "";
    $("size").value = d.size || "piccola";
    $("paint").value = d.paint || "no";
    $("name").value = d.name === "Cliente" ? "" : d.name;
    $("phone").value = d.phone === "N/D" ? "" : d.phone;
    points3d = Array.isArray(d.damagePoints) ? d.damagePoints : [];
    selectedPanels = Array.isArray(d.panelsArray) && d.panelsArray.length ? d.panelsArray : [...new Set(points3d.map(p => p.panel))];
    drawCar();
    renderDamageInfo();
    $("cancelEdit").classList.remove("hidden");
    $("estimateBtn").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearSelectedPhotos() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    selectedPhotoFiles = [];
    $("preview").innerHTML = "";
    $("photoHint").textContent = "Nessuna foto selezionata.";
  }

  function renderSelectedPhotos() {
    previewUrls.forEach(URL.revokeObjectURL);
    previewUrls = [];
    $("preview").innerHTML = "";

    selectedPhotoFiles.forEach((file, index) => {
      const tile = document.createElement("div");
      tile.className = "photo-tile";

      const url = URL.createObjectURL(file);
      previewUrls.push(url);

      const image = document.createElement("img");
      image.src = url;
      image.alt = `Foto danno ${index + 1}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-photo";
      remove.dataset.removePhoto = String(index);
      remove.setAttribute("aria-label", `Rimuovi foto ${index + 1}`);
      remove.textContent = "×";

      tile.append(image, remove);
      $("preview").appendChild(tile);
    });

    $("photoHint").textContent = selectedPhotoFiles.length
      ? `${selectedPhotoFiles.length} foto selezionata${selectedPhotoFiles.length === 1 ? "" : "e"}.`
      : "Nessuna foto selezionata.";
  }

  function addSelectedPhotos(fileList) {
    const incoming = [...(fileList || [])].filter((file) => file && file.type.startsWith("image/"));
    if (!incoming.length) return;

    // Evita duplicati evidenti e limita a 8 foto per pratica.
    incoming.forEach((file) => {
      const duplicate = selectedPhotoFiles.some(
        (existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
      );
      if (!duplicate && selectedPhotoFiles.length < 8) selectedPhotoFiles.push(file);
    });

    renderSelectedPhotos();
    $("photoCheck").className = "photo-check hidden";
  }

  function photoImage(file) {
    return new Promise((ok, no) => {
      const u = URL.createObjectURL(file), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); ok(im); };
      im.onerror = () => { URL.revokeObjectURL(u); no(new Error()); };
      im.src = u;
    });
  }

  async function checkPhotos() {
    const files = selectedPhotoFiles.slice(0, 6);
    if (!files.length) { alert("Prima carica almeno una foto."); return; }
    let bad = 0, low = 0;
    for (const f of files) {
      try {
        const im = await photoImage(f);
        if (im.naturalWidth < 900 || im.naturalHeight < 600) low++;
        const c = document.createElement("canvas");
        const w = Math.min(150, im.naturalWidth), h = Math.max(1, Math.round(im.naturalHeight * w / im.naturalWidth));
        c.width = w; c.height = h;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(im, 0, 0, w, h);
        const a = g.getImageData(0, 0, w, h).data;
        let sum = 0, sq = 0;
        for (let i = 0; i < a.length; i += 4) {
          const b = .2126 * a[i] + .7152 * a[i + 1] + .0722 * a[i + 2];
          sum += b; sq += b * b;
        }
        const n = a.length / 4, mean = sum / n, contrast = Math.sqrt(Math.max(0, sq / n - mean * mean));
        if (mean < 55 || mean > 205 || contrast < 20) bad++;
      } catch { bad++; }
    }
    const score = Math.max(0, 100 - (files.length < 3 ? 30 : 0) - bad * 18 - low * 10);
    const issues = [];
    if (files.length < 3) issues.push("servono almeno 3 foto");
    if (bad) issues.push(`${bad} foto con luce o contrasto debole`);
    if (low) issues.push(`${low} foto poco definite`);
    const box = $("photoCheck");
    box.className = `photo-check ${score >= 70 ? "good" : "warning"}`;
    box.innerHTML = `<strong>Controllo foto: ${score}/100</strong><br><span class="small">${issues.length ? issues.join(" · ") : "Qualità tecnica buona. Per contare davvero i bolli collegheremo poi l’IA online."}</span>`;
  }

  function bindApp() {
    $("undoPoint").addEventListener("click", () => {
      if (points3d.length) {
        points3d.pop();
        selectedPanels = [...new Set(points3d.map(p => p.panel))];
        drawCar();
        renderDamageInfo();
      }
    });
    $("clearPoints").addEventListener("click", () => {
      if (points3d.length && confirm("Vuoi cancellare tutti i punti danno?")) {
        points3d = [];
        selectedPanels = [];
        drawCar();
        renderDamageInfo();
      }
    });
    $("damageList").addEventListener("click", e => {
      const b = e.target.closest("[data-remove]");
      if (!b) return;
      points3d.splice(Number(b.dataset.remove), 1);
      selectedPanels = [...new Set(points3d.map(p => p.panel))];
      drawCar();
      renderDamageInfo();
    });
    $("galleryPhotos").addEventListener("change", (event) => {
      addSelectedPhotos(event.target.files);
      event.target.value = "";
    });

    $("cameraPhotos").addEventListener("change", (event) => {
      addSelectedPhotos(event.target.files);
      event.target.value = "";
    });

    $("clearPhotos").addEventListener("click", () => {
      clearSelectedPhotos();
      $("photoCheck").className = "photo-check hidden";
    });

    $("preview").addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-photo]");
      if (!remove) return;
      selectedPhotoFiles.splice(Number(remove.dataset.removePhoto), 1);
      renderSelectedPhotos();
      $("photoCheck").className = "photo-check hidden";
    });
    $("checkPhotos").addEventListener("click", checkPhotos);
    $("estimateBtn").addEventListener("click", () => {
      const e = makeEstimate(), panels = selectedPanels.length ? selectedPanels.join(", ") : "Non indicati";
      latestEstimate = {
        date: new Date().toLocaleString("it-IT"),
        carModel: $("carModel").value.trim() || "Auto non specificata",
        plate: $("plate").value.trim() || "N/D",
        city: $("city").value.trim() || "Città non specificata",
        panels, panelsArray: [...selectedPanels],
        damagePoints: points3d.map(p => ({ ...p, position: [...p.position] })),
        dents: String(e.dents), dentsValue: String(e.dents),
        size: $("size").value, paint: $("paint").value,
        name: $("name").value.trim() || "Cliente", phone: $("phone").value.trim() || "N/D",
        suggestedPrice: e.price, finalPrice: e.price, estimate: `${e.price}€`,
        severity: e.severity, notes: e.notes.join(", ") || "Nessuna"
      };
      $("price").textContent = `${e.price}€`;
      $("finalPrice").value = e.price;
      $("diagnosis").textContent = `Danno ${e.severity}. Bolli: ${e.dents}. Pannelli: ${panels}. Punti 3D segnati: ${points3d.length}. ${latestEstimate.notes !== "Nessuna" ? "Note: " + latestEstimate.notes : ""}`;
      $("result").classList.remove("hidden");
      $("saveLead").textContent = editIndex === null ? "Salva richiesta" : "Aggiorna richiesta";
      $("whatsapp").href = `https://wa.me/?text=${encodeURIComponent(buildText(latestEstimate))}`;
    });
    $("finalPrice").addEventListener("input", () => {
      if (!latestEstimate) return;
      const n = Number($("finalPrice").value);
      if (!Number.isFinite(n) || n < 0) return;
      latestEstimate.finalPrice = n;
      latestEstimate.estimate = `${n}€`;
      $("price").textContent = `${n}€`;
      $("whatsapp").href = `https://wa.me/?text=${encodeURIComponent(buildText(latestEstimate))}`;
    });
    $("saveLead").addEventListener("click", () => {
      if (!latestEstimate) { alert("Prima genera una stima."); return; }
      const leads = getLeads();
      if (editIndex === null) leads.unshift(latestEstimate); else leads[editIndex] = latestEstimate;
      putLeads(leads);
      alert(editIndex === null ? "Richiesta salvata." : "Richiesta aggiornata.");
      renderLeads();
      resetForm();
    });
    $("copyText").addEventListener("click", async () => {
      if (!latestEstimate) return;
      const text = buildText(latestEstimate);
      try { await navigator.clipboard.writeText(text); }
      catch {
        const t = document.createElement("textarea");
        t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
      }
      alert("Testo copiato.");
    });
    $("cancelEdit").addEventListener("click", resetForm);
    $("search").addEventListener("input", renderLeads);
    $("leads").addEventListener("click", e => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-delete]");
      if (edit) loadEdit(Number(edit.dataset.edit));
      if (del && confirm("Vuoi davvero eliminare questa richiesta?")) {
        const leads = getLeads();
        leads.splice(Number(del.dataset.delete), 1);
        putLeads(leads);
        renderLeads();
      }
    });
  }

  function boot() {
    bind3D();
    bindApp();
    resizeCanvas();
    renderDamageInfo();
    renderLeads();
    window.addEventListener("resize", resizeCanvas);
  }

  boot();
})();
