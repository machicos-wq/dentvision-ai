# DentVision AI v1.6 – IA pronta

## Cosa funziona subito
- Tutte le funzioni della v1.5.1
- Analisi tecnica locale delle foto: numero, definizione, luminosità e contrasto
- Schermata IA professionale già integrata
- Applicazione automatica di pannelli, fascia bolli, dimensione e vernice dopo un'analisi IA reale

## Cosa richiede il worker
GitHub Pages pubblica file statici e non può custodire una chiave API. Per questo l'analisi visiva reale passa dal piccolo server sicuro nella cartella `ai-worker`.

### Pubblicare l'app sul tuo GitHub Pages
Carica nella radice del repository questi file:
- index.html
- style.css
- app.js
- ai-config.js
- manifest.json
- icon.svg

La cartella `ai-worker` NON va pubblicata come sito: serve per creare il Worker IA separato.

### Prima prova senza worker
Lascia `ai-config.js` così com'è. Il pulsante Analizza foto verificherà la qualità tecnica delle foto, ma non inventerà il numero di bolli. Umanità salva dall'ennesimo preventivo sparato a caso.

### Collegare IA reale
Segui `ai-worker/README.md`, poi incolla nel file `ai-config.js` l'URL del worker. Da quel momento il pulsante analizzerà le immagini e proporrà intervallo bolli, pannelli, dimensione e confidenza.


## Aggiornamento v1.6.1
Questa versione include `service-worker.js`, che elimina automaticamente la vecchia cache della v1.4/v1.5 dopo il primo aggiornamento. Caricare tutti i file nella radice del repository, compreso `service-worker.js`.
