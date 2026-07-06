# DentVision AI v2.0 – Versione operativa completa

## Cosa contiene
- pratica cliente + veicolo;
- stato lavorazione, priorità, appuntamento e prossima azione;
- berlina 3D ruotabile e zoomabile;
- zone danno con pannello, riferimento, quantità bolli, grandezza, profondità, vernice e note;
- fino a 6 foto per zona;
- controllo tecnico base delle foto: quantità, luce, contrasto e definizione;
- listino, modificatori, prezzo suggerito, prezzo finale modificabile e tempo indicativo;
- archivio con ricerca e filtro stato;
- WhatsApp e copia riepilogo;
- report stampabile, da salvare come PDF dal menu di stampa del telefono;
- backup JSON ed elenco CSV;
- bozza automatica locale.

## Limiti onesti
Le foto sono memorizzate nel browser del telefono tramite IndexedDB:
- non vengono pubblicate online;
- non vengono inviate automaticamente su WhatsApp;
- non entrano nel backup JSON;
- se cancelli i dati del browser o cambi telefono, possono sparire.

L'IA che riconosce automaticamente bolli da foto non è inclusa: per farla davvero serve un server sicuro e un modello addestrato. La v2.0 prepara tutte le informazioni che quell'IA dovrà leggere.

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
DentVision AI v2.0 gestione completa PDR

Apri il sito con `?v=200` dopo la pubblicazione.
