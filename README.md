# DentVision AI v1.7.6 – Auto migliorata

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
DentVision AI v1.7.6 auto migliorata offline


## Correzione v1.7.6 – Galleria foto
Il campo foto non usa più `capture="environment"`, che su Android apriva direttamente la fotocamera.

Ora c'è il pulsante **Scegli dalle foto**:
- apre la galleria / gestione file del telefono;
- consente di scegliere immagini già scattate;
- non obbliga ad aprire la fotocamera.

Commit consigliato:
`DentVision AI v1.7.6 scelta foto da galleria`


## v1.7.6 – Berlina e galleria corretta
- Auto trasformata in una berlina 3D più slanciata: cofano, parabrezza, tetto, lunotto, baule, porte, fari, calandra, targa e specchietti.
- La vista iniziale mostra il frontale, non più il retro.
- La galleria usa un `label` collegato direttamente al campo file, senza `capture` e senza il tipo generico `image/*`.
- Il pulsante **Scegli dalla galleria** apre il selettore foto/file Android invece della fotocamera.

Commit:
`DentVision AI v1.7.6 berlina 3D e galleria corretta`


## v1.7.6 – Galleria e fotocamera separate
Ora ci sono tre comandi chiari:
- **Apri galleria**: per scegliere foto già presenti sul telefono. Non ha `capture`, quindi non deve richiamare la fotocamera.
- **Scatta foto**: apre volutamente la fotocamera posteriore.
- **Rimuovi foto**: cancella tutte le immagini selezionate. Ogni anteprima ha anche la sua X per rimuovere una foto singola.

Nota: nei browser Android non esiste un comando web universale che obblighi il sistema a usare solo una specifica app Galleria. Questa configurazione usa il selettore file/foto senza `capture`, cioè la via standard che mostra le foto/file esistenti.

Commit:
`DentVision AI v1.7.6 galleria e fotocamera separate`
