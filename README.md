# DecoWebCluster

Client web moderno per **DX Cluster** (DXSpider), nato per [IQ8DO](https://iq8do.aricaserta.it/) della Sezione A.R.I. di Caserta.
Funziona nel browser e sul telefono (PWA installabile), in italiano e in inglese, con tema chiaro e scuro.

*A modern web client for DXSpider DX clusters: live map, spot feed, propagation, statistics and a personal area. Italian and English UI.*

## Funzioni

- **Mappa** in tempo reale (proiezioni 2D e globo WebGL) con spot, archi, linea grigia giorno/notte, zone CQ/ITU, beacon, satelliti, terremoti.
- **Elenco spot** con filtri per banda, modo, continente, fonte (cluster, skimmer CW/FT8), watchlist e avvisi.
- **Propagazione**: indici solari, HF per banda, previsioni e matrice di apertura delle bande.
- **Analisi** statistiche sugli spot e **visitatori online** anonimi.
- **Strumenti radio**: locator, distanze, sole/luna, convertitori, antenne, console cluster.
- **Log personale**: carica l'ADIF e vedi cosa ti serve (nuovo DXCC, banda, modo).
- **Area personale** con accesso via link email o password, **invio spot** dal web (utenti approvati), avvisi Telegram.
- Pulsante per girare uno spot al gruppo WhatsApp (copia il testo e apre il gruppo).

## Struttura

```
src/      sorgenti del frontend (JavaScript, senza framework)
public/   pagine, stili, bandiere, icone, service worker
tools/    generazione dati (prefissi CTY, zone CQ/ITU)
server/   servizi Python di supporto (account, statistiche, avvisi Telegram)
build.mjs compila con esbuild in dist/
dev.mjs   server di sviluppo locale
nginx-iq8do-v2.conf   esempio di configurazione nginx
```

## Compilare

```
npm ci
npm run build      # crea dist/
npm run dev        # server locale per provare (variabile PSK_CONTACT = tuo contatto per PSK Reporter)
```

Pubblica il contenuto di `dist/` dietro nginx, sullo stesso dominio del cluster: il frontend legge `/spotlist` e le altre pagine del cluster, più `/api/` (account), `/stats/` (statistiche).

## Servizi lato server (`server/`)

Python 3, solo libreria standard. Si configurano con variabili d'ambiente e girano in locale dietro nginx:

| File | Porta | Compito |
|---|---|---|
| `accounts.py` | 8093 | account, accesso con link/password, log ADIF, invio spot, console |
| `stats.py` | 8094 | archivio spot (SQLite, letto da MariaDB di DXSpider), statistiche, visitatori online |
| `tg.py` | – | avvisi su Telegram (via plugin WordPress firmato con HMAC) |

I segreti (`MAIL_SECRET`, password MariaDB di sola lettura) non sono nel codice: vanno in file d'ambiente protetti, ad esempio `EnvironmentFile=` di systemd.

## Dati e licenze di terze parti

- Prefissi: Country Files di AD1C (`tools/cty.dat`).
- Bandiere: [flag-icons](https://github.com/lipis/flag-icons) (MIT). Mappe: world-atlas / Natural Earth (pubblico dominio).
- Propagazione e meteo spaziale: NOAA SWPC. Spot PSK: PSK Reporter.

## Licenza

MIT, vedi `LICENSE`.

73 de IU8LMC

## Nota

I loghi della DXpedition 9T0MD (`icons/9t0md.jpg`, `icons/9t0md-logo.jpg`) non sono inclusi nel repository perché appartengono al team: la scheda "Special cluster" funziona, ma senza le immagini.
Il link d'invito del gruppo WhatsApp (`WA_GROUP` in `src/app.js`) è lasciato vuoto: impostalo se vuoi il pulsante verso il tuo gruppo.
