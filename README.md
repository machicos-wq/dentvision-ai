# DentVision AI v1.7.4 – Auto migliorata

Questa versione mantiene il 3D offline, ma rifà la macchina in modo più automobilistico:

- frontale e retro più leggibili
- cofano, tetto e baule più rifiniti
- vetri, fari, specchietti, paraurti
- selezione pannelli ancora funzionante
- niente dipendenze esterne

## File da caricare nella radice GitHub
- index.html
- style.css
- app.js
- ai-config.js
- manifest.json
- icon.svg
- README.md
- service-worker.js

## Commit
DentVision AI v1.7.4 auto migliorata offline


## Correzione v1.7.4 – Galleria foto
Il campo foto non usa più `capture="environment"`, che su Android apriva direttamente la fotocamera.

Ora c'è il pulsante **Scegli dalle foto**:
- apre la galleria / gestione file del telefono;
- consente di scegliere immagini già scattate;
- non obbliga ad aprire la fotocamera.

Commit consigliato:
`DentVision AI v1.7.4 scelta foto da galleria`
