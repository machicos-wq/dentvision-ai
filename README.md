# DentVision AI v1.7.1 – Correzione auto 3D

## Errore corretto
La scena 3D restava vuota perché `OrbitControls` richiedeva Three.js con un import interno che il browser non riusciva a risolvere.

La versione 1.7.1 aggiunge una **import map** nel file `index.html`, così Chrome sa esattamente da dove caricare sia Three.js sia i controlli per rotazione e zoom.

## File da caricare nella radice del repository
- index.html
- style.css
- app.js
- ai-config.js
- manifest.json
- icon.svg
- README.md
- service-worker.js

## Commit
`DentVision AI v1.7.1 correzione auto 3D`

Dopo il commit apri una volta il sito da Chrome con `?v=171` alla fine dell’indirizzo. La prima apertura richiede connessione internet per scaricare il motore 3D.
