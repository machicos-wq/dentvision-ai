const APP_VERSION = "1.2-anticache";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js?v=12").then(reg => {
    reg.update();
  });
}

const $ = id => document.getElementById(id);
const photos = $("photos");
const preview = $("preview");
let lastText = "";
let lastEstimate = null;
let editIndex = null;

photos.addEventListener("change", () => {
  preview.innerHTML = "";
  [...photos.files].slice(0, 8).forEach(file => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
});

$("searchLeads").addEventListener("input", renderLeads);

function estimate() {
  const dents = Number($("dents").value);
  const area = $("area").value;
  const size = $("size").value;
  const paint = $("paint").value;

  let base = dents * 9;
  if (area === "tetto") base *= 1.35;
  if (area === "fiancata") base *= 1.15;
  if (area === "multipla") base *= 1.85;
  if (size === "media") base *= 1.35;
  if (size === "grande") base *= 1.95;
  if (paint === "si") base *= 1.45;

  const min = Math.round(base * 0.78 / 10) * 10;
  const max = Math.round(base * 1.28 / 10) * 10;

  let severity = "lieve";
  if (max >= 650) severity = "medio";
  if (max >= 1300) severity = "importante";
  return { min, max, severity };
}

function buildText(data) {
  return `DentVision AI - Nuova richiesta
Cliente: ${data.name}
Telefono: ${data.phone}
Auto: ${data.carModel}
Targa/Rif.: ${data.plate}
Città: ${data.city}
Zona: ${data.area}
Bolli: ${data.dents}
Grandezza: ${data.size}
Vernice danneggiata: ${data.paint}
Stima: ${data.estimate}
Gravità: ${data.severity}`;
}

$("estimateBtn").addEventListener("click", () => {
  const data = {
    date: new Date().toLocaleString("it-IT"),
    carModel: $("carModel").value || "Auto non specificata",
    plate: $("plate").value || "N/D",
    city: $("city").value || "Città non specificata",
    area: $("area").value,
    dentsValue: $("dents").value,
    dents: $("dents").selectedOptions[0].text,
    size: $("size").value,
    paint: $("paint").value,
    name: $("name").value || "Cliente",
    phone: $("phone").value || "N/D"
  };

  const e = estimate();
  data.estimate = `${e.min}€ - ${e.max}€`;
  data.severity = e.severity;
  lastEstimate = data;

  $("price").textContent = data.estimate;
  $("diagnosis").textContent = `Danno ${e.severity}. Stima preliminare: da confermare con controllo tecnico e foto in luce radente.`;
  $("result").classList.remove("hidden");

  lastText = buildText(data);
  $("whatsapp").href = "https://wa.me/?text=" + encodeURIComponent(lastText);
  $("saveLead").textContent = editIndex !== null ? "Aggiorna richiesta" : "Salva richiesta";
});

$("copyText").addEventListener("click", async () => {
  if (!lastText) return;
  await navigator.clipboard.writeText(lastText);
  alert("Testo copiato.");
});

$("saveLead").addEventListener("click", () => {
  if (!lastEstimate) return;
  const leads = getLeads();

  if (editIndex !== null) {
    leads[editIndex] = lastEstimate;
    editIndex = null;
    $("cancelEditBtn").classList.add("hidden");
    $("saveLead").textContent = "Salva richiesta";
  } else {
    leads.unshift(lastEstimate);
  }

  setLeads(leads);
  renderLeads();
  alert("Richiesta salvata.");
});

$("cancelEditBtn").addEventListener("click", () => {
  editIndex = null;
  $("cancelEditBtn").classList.add("hidden");
  $("saveLead").textContent = "Salva richiesta";
  clearForm();
});

function getLeads() {
  return JSON.parse(localStorage.getItem("dentvision_leads") || "[]");
}

function setLeads(leads) {
  localStorage.setItem("dentvision_leads", JSON.stringify(leads));
}

function renderLeads() {
  const allLeads = getLeads();
  const q = $("searchLeads").value.trim().toLowerCase();

  const filtered = allLeads
    .map((lead, index) => ({ lead, index }))
    .filter(({ lead }) => {
      const haystack = [lead.name, lead.phone, lead.plate, lead.carModel, lead.city].join(" ").toLowerCase();
      return haystack.includes(q);
    });

  $("leads").innerHTML = filtered.length ? "" : "<p class='hint'>Nessuna richiesta trovata.</p>";

  filtered.forEach(({ lead, index }) => {
    const div = document.createElement("div");
    div.className = "lead";
    div.innerHTML = `<strong>${escapeHtml(lead.name)}</strong> · ${escapeHtml(lead.carModel)}<br>
    ${escapeHtml(lead.city)} · ${escapeHtml(lead.estimate)} · ${escapeHtml(lead.date)}<br>
    <span class="small">Tel: ${escapeHtml(lead.phone)} · Targa/Rif.: ${escapeHtml(lead.plate || "N/D")} · Danno: ${escapeHtml(lead.severity)}</span>
    <div class="lead-actions">
      <button onclick="editLead(${index})">Modifica</button>
      <button class="danger" onclick="deleteLead(${index})">Elimina</button>
      <a class="whatsapp" target="_blank" href="https://wa.me/?text=${encodeURIComponent(buildText(lead))}">WhatsApp</a>
    </div>`;
    $("leads").appendChild(div);
  });
}

function editLead(index) {
  const leads = getLeads();
  const lead = leads[index];
  if (!lead) return;

  editIndex = index;
  $("carModel").value = lead.carModel || "";
  $("plate").value = lead.plate || "";
  $("city").value = lead.city || "";
  $("area").value = lead.area || "cofano";
  $("dents").value = lead.dentsValue || inferDentsValue(lead.dents);
  $("size").value = lead.size || "piccola";
  $("paint").value = lead.paint || "no";
  $("name").value = lead.name || "";
  $("phone").value = lead.phone || "";

  $("cancelEditBtn").classList.remove("hidden");
  $("estimateBtn").scrollIntoView({ behavior: "smooth", block: "center" });
  alert("Dati caricati nel modulo. Modifica, premi Genera stima e poi Aggiorna richiesta.");
}

function deleteLead(index) {
  if (!confirm("Vuoi davvero eliminare questa richiesta?")) return;
  const leads = getLeads();
  leads.splice(index, 1);
  setLeads(leads);
  renderLeads();
}

function clearForm() {
  ["carModel", "plate", "city", "name", "phone"].forEach(id => $(id).value = "");
  $("area").value = "cofano";
  $("dents").value = "10";
  $("size").value = "piccola";
  $("paint").value = "no";
  $("result").classList.add("hidden");
}

function inferDentsValue(label) {
  if (!label) return "10";
  if (label.includes("11")) return "30";
  if (label.includes("31")) return "70";
  if (label.includes("70")) return "120";
  return "10";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderLeads();
