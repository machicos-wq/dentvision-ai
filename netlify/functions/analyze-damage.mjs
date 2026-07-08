const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function extractText(data) {
  if (typeof data?.output_text === "string") return data.output_text;

  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.output_text === "string") parts.push(content.output_text);
    }
  }

  return parts.join("\n").trim();
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizzaAnalisi(a = {}) {
  const min = Math.max(0, Math.round(Number(a.dent_count_min) || 0));
  const max = Math.max(min, Math.round(Number(a.dent_count_max) || min || 1));
  const suggested = Math.max(1, Math.round(Number(a.suggested_dents) || min || 1));

  return {
    verdict: String(a.verdict || "Analisi preliminare IA"),
    panel_suggestion: String(a.panel_suggestion || "Da definire"),
    damage_presence: String(a.damage_presence || "possible"),
    dent_count_min: min,
    dent_count_max: max,
    suggested_dents: Math.min(suggested, max),
    size: String(a.size || "non_valutabile"),
    depth: String(a.depth || "non_valutabile"),
    paint: String(a.paint || "incerto"),
    confidence: Math.max(0, Math.min(100, Math.round(Number(a.confidence) || 0))),
    photo_quality: String(a.photo_quality || "Da verificare"),
    needs_more_photos: Boolean(a.needs_more_photos),
    caution: String(a.caution || "Verifica sempre dal vivo prima di fare il preventivo."),
    explanation: String(a.explanation || "Analisi basata solo sulle foto caricate."),
    recommended_photo: String(a.recommended_photo || "Scatta foto con luce radente e riflesso controllato."),
    analyzedAt: new Date().toISOString()
  };
}

export default async function handler(request) {
  if (request.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: corsHeaders
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, {
      error: "Metodo non consentito. Usa POST."
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return jsonResponse(500, {
      error: "OPENAI_API_KEY mancante nelle variabili ambiente Netlify."
    });
  }

  let payload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, {
      error: "JSON non valido."
    });
  }

  const images = Array.isArray(payload.images) ? payload.images.slice(0, 3) : [];
  const context = payload.context || {};

  const validImages = images.filter((img) => {
    return (
      typeof img === "string" &&
      img.startsWith("data:image/") &&
      img.includes("base64,")
    );
  });

  if (!validImages.length) {
    return jsonResponse(400, {
      error: "Nessuna immagine valida ricevuta."
    });
  }

  const prompt = `
Sei un assistente tecnico per levabolli PDR.
Devi analizzare foto di danni da grandine su auto.

Rispondi SOLO con JSON valido, senza markdown.

Contesto:
- Auto: ${context.carModel || "non indicata"}
- Pannello indicato: ${context.panel || "da definire"}
- Zona: ${context.zone || "non indicata"}
- Nota operatore: ${context.operatorNote || "nessuna"}

Restituisci esattamente questi campi:
{
  "verdict": "frase breve in italiano",
  "panel_suggestion": "Cofano | Tetto | Baule | Fiancata sinistra | Fiancata destra | Parafango anteriore sinistro | Parafango anteriore destro | Parafango posteriore sinistro | Parafango posteriore destro | Altro | Da definire",
  "damage_presence": "none_visible | possible | likely",
  "dent_count_min": numero,
  "dent_count_max": numero,
  "suggested_dents": numero,
  "size": "piccola | media | grande | non_valutabile",
  "depth": "lieve | media | forte | non_valutabile",
  "paint": "no | si | incerto",
  "confidence": numero da 0 a 100,
  "photo_quality": "giudizio breve sulla foto",
  "needs_more_photos": true oppure false,
  "caution": "avviso prudente",
  "explanation": "spiegazione breve",
  "recommended_photo": "che foto servirebbe se non basta"
}

Regole:
- Sii prudente.
- Non inventare bolli se non sono visibili.
- Se ci sono riflessi, sporco o luce scarsa, abbassa la confidenza.
- Non dichiarare con certezza danni alla vernice.
- Per PDR dai un suggerimento utile, ma lascia la decisione finale all'operatore.
`;

  const content = [
    {
      type: "input_text",
      text: prompt
    },
    ...validImages.map((image) => ({
      type: "input_image",
      image_url: image
    }))
  ];

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content
          }
        ],
        max_output_tokens: 900
      })
    });

    const data = await openaiResponse.json().catch(() => ({}));

    if (!openaiResponse.ok) {
      return jsonResponse(openaiResponse.status, {
        error: data?.error?.message || "Errore OpenAI."
      });
    }

    const text = extractText(data);
    const parsed = parseJson(text);

    if (!parsed) {
      return jsonResponse(502, {
        error: "Risposta IA non leggibile.",
        raw: text.slice(0, 500)
      });
    }

    return jsonResponse(200, {
      ok: true,
      analysis: normalizzaAnalisi(parsed)
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error?.message || "Errore server durante analisi IA."
    });
  }
}

export const config = {
  path: "/api/analyze-damage"
};
