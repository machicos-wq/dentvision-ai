# DentVision AI v1.8.0 – modello 3D reale

Questa versione sostituisce l'auto disegnata a mano con il file `generic_sedan_car.glb` ricevuto.

## Cosa cambia
- Berlina 3D reale in GLB, inclusa nella cartella del sito.
- Rotazione e zoom con le dita tramite `model-viewer`.
- Tocca la carrozzeria per creare un hotspot rosso fissato sulla superficie del modello.
- I puntini vengono salvati nella pratica e ripristinati quando modifichi una richiesta.
- Galleria e fotocamera restano separate.

## Importante
Il file GLB ricevuto non contiene pannelli della carrozzeria nominati separatamente come cofano, tetto e porte. Quindi l'app salva il punto esatto, ma lo chiama `Carrozzeria 3D`; per la selezione automatica del pannello serve un modello GLB preparato con quei pezzi separati e nominati.

Il modello 3D è un file locale nel repository. Il componente che lo mostra viene caricato da CDN, con tentativo di riserva su un secondo CDN: per la prima apertura serve internet.

## File da caricare nella radice GitHub
- index.html
- style.css
- app.js
- ai-config.js
- manifest.json
- icon.svg
- README.md
- service-worker.js
- generic_sedan_car.glb

## Commit
`DentVision AI v1.8.0 modello 3D reale`

## Crediti modello
Metadata nel GLB: **Generic Sedan Car**, autore **assetfactory**, licenza **Sketchfab Standard**.
