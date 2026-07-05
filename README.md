# DentVision AI v1.7.2 – Auto 3D offline corretta

## Perché questa versione funziona
La versione precedente dipendeva da Three.js e da file esterni. Sul telefono il caricamento del modulo esterno restava bloccato, quindi il riquadro rimaneva vuoto.

Questa versione:
- non scarica Three.js;
- disegna l'auto 3D direttamente con Canvas;
- ruota con un dito;
- zooma con due dita;
- salva un puntino rosso nel punto toccato;
- funziona anche quando la rete è lenta, perché il motore 3D è tutto dentro `app.js`.

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
DentVision AI v1.7.2 auto 3D offline corretta

Apri il sito con `?v=172` alla fine dell'indirizzo dopo il commit.
