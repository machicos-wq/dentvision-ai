# DentVision AI v2.1.1 – Assistente IA foto

Questa versione aggiunge una **pre-analisi visiva assistita** alla singola zona danno.

## Cosa fa

1. Apri una zona sul modello 3D.
2. Collega da 1 a 3 foto della stessa zona.
3. Premi **Analizza con IA**.
4. L'IA restituisce:
   - presenza del danno visibile;
   - fascia prudente di bolli;
   - grandezza e profondità suggerite;
   - stato visivo della vernice;
   - confidenza e richiesta di foto migliori;
   - attenzione tecnica da controllare.
5. Premi **Applica suggerimento** solo dopo averlo letto: i campi restano sempre modificabili e vanno confermati dal levabolli.

## Limiti importanti

- Non è una perizia assicurativa.
- Non genera un preventivo automatico senza il controllo umano.
- Se luce, riflessi o distanza non permettono di vedere i bolli, deve dichiararlo invece di inventare un numero.
- Evita foto con volti, documenti o targhe non necessari.

## Per attivare l'IA vera

Questa versione richiede **Netlify Functions** e una chiave API OpenAI salvata nelle variabili protette di Netlify.

1. Pubblica il progetto con una modalità che distribuisca le funzioni, preferibilmente collegando il repository GitHub a Netlify.
2. In Netlify apri `Project configuration` → `Environment variables`.
3. Aggiungi:

```text
OPENAI_API_KEY = la tua chiave API OpenAI
OPENAI_VISION_MODEL = gpt-5-mini
```

La chiave non va mai inserita in `ai-config.js`, `app.js`, GitHub o nel browser.

4. Fai un nuovo deploy.
5. Apri una zona con foto e premi **Analizza con IA**.

Il file server-side è:

```text
netlify/functions/analyze-damage.mjs
```

ed è esposto solo sul tuo sito come:

```text
/api/analyze-damage
```

## File principali

```text
index.html
style.css
app.js
ai-config.js
manifest.json
service-worker.js
generic_sedan_car.glb
netlify.toml
netlify/functions/analyze-damage.mjs
```


## Correzione mobile v2.1.1

- L’elenco delle zone danno ora usa pulsanti **Modifica** e **Rimuovi** compatti su smartphone.
- Le azioni vengono messe sotto ai dettagli della zona, in due pulsanti affiancati.
- Corretto l’allungamento verticale dei pulsanti nelle schede delle zone.
