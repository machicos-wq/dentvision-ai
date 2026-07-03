if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}

const $ = id => document.getElementById(id);
const photos = $("photos");
const preview = $("preview");
let lastText = "";
let lastEstimate = null;

photos.addEventListener("change", () => {
  preview.innerHTML = "";
  [...photos.files].slice(0, 8).forEach(file => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  });
});

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

$("estimateBtn").addEventListener("click", () => {
  const data = {
    date: new Date().toLocaleString("it-IT"),
    carModel: $("carModel").value || "Auto non specificata",
    plate: $("plate").value || "N/D",
    city: $("city").value || "Città non specificata",
    area: $("area").value,
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

  lastText =
`DentVision AI - Nuova richiesta
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

  $("whatsapp").href = "https://wa.me/?text=" + encodeURIComponent(lastText);
});

$("copyText").addEventListener("click", async () => {
  if (!lastText) return;
  await navigator.clipboard.writeText(lastText);
  alert("Testo copiato.");
});

$("saveLead").addEventListener("click", () => {
  if (!lastEstimate) return;
  const leads = JSON.parse(localStorage.getItem("dentvision_leads") || "[]");
  leads.unshift(lastEstimate);
  localStorage.setItem("dentvision_leads", JSON.stringify(leads));
  renderLeads();
});

function renderLeads() {
  const leads = JSON.parse(localStorage.getItem("dentvision_leads") || "[]");
  $("leads").innerHTML = leads.length ? "" : "<p class='hint'>Nessuna richiesta salvata.</p>";
  leads.forEach(l => {
    const div = document.createElement("div");
    div.className = "lead";
    div.innerHTML = `<strong>${l.name}</strong> · ${l.carModel}<br>
    ${l.city} · ${l.estimate} · ${l.date}<br>
    <span class="small">Tel: ${l.phone} · Danno: ${l.severity}</span>`;
    $("leads").appendChild(div);
  });
}
renderLeads();
