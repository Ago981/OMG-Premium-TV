# 📺 OMG Premium TV per Stremio

***[🇮🇹 Leggi in italiano](README.md)*** - ***[🇬🇧 Read in English](README-EN.md)*** - ***[🇫🇷 Lire en Français](README-FR.md)*** - ***[🇪🇸 Leer en español](README-ES.md)***

<img width="1440" alt="Screenshot 2025-02-28 alle 21 36 52" src="https://github.com/user-attachments/assets/c85b2a33-0174-4cb3-b7a9-2cc2140c8c0f" />

## 👋 Introduzione

Benvenuto in OMG Premium TV, l'addon per Stremio che ti permette di guardare i tuoi canali TV e IPTV preferiti da playlist M3U/M3U8, arricchiti con informazioni sui programmi (EPG). Questa guida ti aiuterà a sfruttare al meglio tutte le funzionalità disponibili.

### ⚠️ Leggi con attenzione!

Lavorare a questo addon, tenerlo aggiornato è costato tantissime ore e tantissimo impegno ❤️
Un caffè ☕ o una birra sono 🍺 un gesto di riconoscenza molto apprezzato e mi aiutano a continuare e a mantenere attivo questo progetto!

**Con una donazione verrai inserito in un gruppo telegram dedicato dove riceverai in anteprima le nuove versioni! Ti aspetto!**

<a href="https://www.buymeacoffee.com/mccoy88f"><img src="https://img.buymeacoffee.com/button-api/?text=Offrimi%20una%20birra&emoji=%F0%9F%8D%BA&slug=mccoy88f&button_colour=FFDD00&font_colour=000000&font_family=Bree&outline_colour=000000&coffee_colour=ffffff" /></a>

[Puoi anche offrirmi una birra con PayPal 🍻](https://paypal.me/mccoy88f?country.x=IT&locale.x=it_IT)




## 🔄 Changelog di OMG Premium TV

### 🚀 Versione 8.4.1 (Attuale)

Correzioni sugli stream:
- **Stream via proxy mai scartati**: la verifica rapida parte dal server (via WARP) e può fallire anche quando il player dal dispositivo funziona (timeout di EasyProxy, blocchi del dominio del proxy verso WARP). Ora lo stream via proxy viene sempre offerto, segnato con ⚠️ se la verifica non è andata; con «Solo proxy» resta escluso solo il link diretto.
- **Canali salvati in Stremio**: se la playlist cambia leggermente id o nome di un canale (es. aggiunta di «HD» o del suffisso paese) il canale viene ritrovato; se non esiste più compare un messaggio invece di una lista vuota.
- **Film e serie aggiornati con la playlist**: niente più pulsante «Aggiorna ora»; si aggiornano all'intervallo della playlist e con il canale «Aggiorna playlist M3U» della configurazione.
- **Copertine di film e serie**: si usano copertina e sfondo di TMDB, con la locandina scelta in base a lingua e paese della configurazione (es. Italiano + Svizzera → `it-CH`: prima la locandina italiana per quel paese, poi quella italiana, poi la principale), poi la copertina del provider, poi quella pubblica di Stremio per l'ID IMDb; senza nessuna, un segnaposto con il titolo. Nessuna richiesta TMDB in più: ID IMDb e immagini arrivano nella stessa chiamata. Dopo l'aggiornamento i titoli già collegati vengono riletti una volta.
- **Nome coerente in Stremio**: addon e cataloghi (canali, film, serie) di ogni configurazione si chiamano `OMG+ TV - <nome configurazione>` (solo `OMG+ TV` senza nome). Per vedere il nuovo nome nelle configurazioni già installate va reinstallato l'addon.
- **Segnaposto colorati**: senza nessuna locandina, film e serie hanno un segnaposto con il titolo come i canali, ma con colori propri: viola i canali, rosso i film, blu petrolio le serie.
- **Wizard**: EPG attivo di default; lingua e nome della configurazione subito sotto il paese, nel primo passaggio; con un account Xtream, nel campo EPG la nota «lascia vuoto per usare la guida prevista dalla configurazione Xtream».
- **Xtream con proxy**: gli stream Xtream non vengono più verificati dal server attraverso il proxy. Ogni prova occupava una delle connessioni dell'abbonamento (spesso una sola) e il provider rispondeva 401 alla prova o al player. Nei log degli stream non verificati compare anche il testo della risposta del proxy, per distinguere la password del proxy sbagliata dall'errore della sorgente.
- **Xtream via proxy (401)**: molti pannelli Xtream rifiutano gli stream chiesti con uno User-Agent da browser. L'addon passava al proxy lo User-Agent Chrome predefinito; ora per i link Xtream (`/live/`, `/movie/`, `/series/`) passa quello di un player (`VLC/3.0.20 LibVLC/3.0.20`, modificabile con `XTREAM_USER_AGENT`), a meno che la playlist non ne indichi uno. Vale per EasyProxy e MediaFlow; WARP del proxy invariato.
- **Nomi puliti**: categorie e canali che iniziano e/o finiscono con 3 o più trattini (`-----DOCUMENTARI-----`, `-----RAI 1-----`) diventano `DOCUMENTARI` e `RAI 1`, sia nelle playlist M3U sia negli account Xtream (live, film e serie). Gli id dei canali non cambiano. Dopo l'aggiornamento playlist e film/serie vengono riscaricati una volta per applicare i nomi puliti (anche alle categorie già nascoste).

### 🚀 Versione 8.4.0

Film e serie Xtream in Scopri:
- I cataloghi Film e Serie hanno lo stesso nome del catalogo dei canali (`OMG+ TV - <nome configurazione>`): il tipo lo indica già Stremio.
- **Sottocategorie** come filtri (da `parent_id` o dal prefisso comune, es. `IT | Azione` → `IT › Azione`); la categoria madre include le figlie.
- **Categorie da nascondere**, scelte con le caselle nella pagina della configurazione: spariscono da cataloghi, ricerca e stream.
- Titoli puliti in elenco (`IT - Il Padrino (1972)` → `Il Padrino`) e paginazione corretta: le copie dello stesso titolo sono unite nel database, ogni pagina ha titoli unici.
- Avviso nella pagina della configurazione: installare (o reinstallare) l'addon quando la sincronizzazione è «Pronto», per avere i filtri delle categorie.

### 🚀 Versione 8.3.0

Film e serie TV dagli account **Xtream Codes**:
- Nuova opzione **Includi film e serie TV**: cataloghi *Film* e *Serie* con le categorie del provider come filtri e la ricerca per titolo; schede con trama, cast ed episodi per stagione.
- Con la **chiave API TMDB** dell'utente (obbligatoria per questa opzione) ogni titolo viene collegato al suo ID IMDb: lo stream compare anche aprendo il film o l'episodio dalle pagine ufficiali di Stremio.
- Abbinamenti salvati per singola configurazione (niente cache condivisa); ai refresh si convertono solo i titoli nuovi. Avanzamento visibile nella pagina della configurazione, con il pulsante «Aggiorna ora».
- Stream di film ed episodi con la stessa pipeline dei canali: proxy, «Solo proxy», mascheramento, uscita via WARP.

### 🚀 Versione 8.2.0

Nuova sorgente canali **Xtream Codes** (solo canali live):
- Nel wizard si può scegliere come sorgente un **account Xtream Codes** (server, username, password) invece di un URL M3U; basta anche incollare il link `get.php` completo.
- Pulsante **Verifica account** con stato, scadenza e connessioni dell'abbonamento.
- Guida TV del provider (`xmltv.php`) attivata automaticamente se non indichi un EPG.
- Tutte le richieste passano dal client dell'addon (WARP/proxy di uscita); credenziali mai visibili nelle risposte o nei log.

### 🚀 Versione 8.1.0

Miglioramenti a prestazioni, privacy dei proxy e compatibilità cataloghi:
- **⚡ Risoluzione stream ultrarapida**: health check dei flussi tramite proxy ridotto a singolo tentativo con timeout a 3 secondi ed eseguito in parallelo (`Promise.all`). Tempi di risposta scesi da oltre 40s a ~1-3s.
- **🛡️ Nuova opzione «Solo proxy»**: attiva di default quando si configura un proxy. Esclude totalmente qualsiasi fallback diretto che esporrebbe l'IP dell'utente qualora il proxy fallisca l'apertura del flusso.
- **🏷️ Cataloghi dinamici multi-configurazione**: il catalogo base è stato rinominato in `OMG+`. Se inserisci un nome per la configurazione (es. "Sport" o "Salotto"), il catalogo in Stremio diventa automaticamente `OMG+ · Sport`, permettendo di installare più configurazioni contemporaneamente senza conflitti o sovrapposizioni.
- **🌐 Modalità «AIOStreams compatibile»**: il suffisso del paese (es. `[ITA]`, `[FRA]`, `[ESP]`) non è più forzato su ogni canale; viene aggiunto solo attivando l'apposita modalità nel tab Avanzate, calcolato in automatico dal paese selezionato nel wizard.
- **🧠 Abbinamento EPG intelligente e permissivo (`smart_epg`)**: nuova opzione attiva di default nella sezione Guida TV. Riconosce e abbina i canali anche quando nella playlist mancano i `tvg-id` o presentano differenze di qualità/risoluzione (es. `LA7` / `LA7 HD` -> `LA7.HD.it`, `TV8 SD` -> `TV8.HD.it`, `Rai 1 4K` -> `Rai.1.HD..101.it`, `Giallo` -> `GIALLO.HD..167.it`). Più canali con formati diversi ricevono coerentemente la stessa guida EPG, triplicando i canali coperti dalla guida senza falsi positivi.
- **📥 Download playlist diretto e affidabile**: le playlist M3U e i file di remapping vengono sempre scaricati direttamente dal server (o via WARP/outbound proxy), azzerando gli errori 502/WAF causati dai proxy HTTP esterni su file di grandi dimensioni.

> ℹ️ *Nota sulla versione precedente*: la versione **7.0.0** (Node.js monolitica classica) rimane pienamente disponibile e consultabile sul branch dedicato [`7.0.0`](https://github.com/mccoy88f/OMG-Premium-TV/tree/7.0.0).

### 🚀 Versione 8.0.0

Riscrittura completa in **TypeScript/TSX** con architettura multi-utente. Guida completa: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

### ✨ Nuove funzionalità
- **🆔 Configurazioni con ID e password**: ogni configurazione è salvata sul server con un ID casuale e protetta da password. In Stremio si installa un URL semplice, `https://tuodominio/c/<ID>/manifest.json`, **senza parametri**: playlist, EPG, proxy e password non compaiono più nell'indirizzo.
- **🛠️ Pannello admin** (`/admin`): elenco di tutte le configurazioni, cancellazione di una o più configurazioni, stato delle guide EPG e delle playlist condivise, password di accesso per creare configurazioni, abilitazione degli script Python.
- **🧭 Interfaccia a passaggi**: Playlist → Guida TV → Proxy → Avanzate → Conferma.
- **🌍 Guide TV predefinite per tutto il mondo**: scegli il paese e aggiungi la guida epgshare01 (oltre 60 paesi e guide tematiche); se non indichi un EPG si usa quello della playlist o, in mancanza, quello del paese. Playlist iptv-org per oltre 200 paesi.
- **📡 EPG centralizzato**: ogni URL EPG viene scaricato una sola volta e condiviso da tutte le configurazioni (stessi ID canale = stessi dati). Lettura in streaming anche di file `.gz` molto grandi, abbinamento anche per nome del canale.
- **🔀 EasyProxy**: supporto a [EasyProxy](https://github.com/realbestia1/EasyProxy) oltre a MediaFlow Proxy, con riconoscimento automatico, pulsante "Verifica proxy" e chiavi **DRM ClearKey** lette dalle playlist (`#KODIPROP`).
- **📱 Nuvio**: compatibilità con [Nuvio](https://github.com/tapframe/NuvioStreaming); gli header di riproduzione sono inviati anche nel formato standard `proxyHeaders`.
- **☁️ Cloudflare**: Tunnel (nessuna porta aperta) o Worker (`cloudflare/worker.js`) per nascondere l'indirizzo del server; link degli stream mascherati e cifrati (`/s/<token>`).
- **🛡️ Uscita da Cloudflare WARP**: tutto ciò che il server scarica (playlist, EPG, verifiche) esce da un container WARP incluso nel compose; senza WARP funzionante i download si fermano invece di usare il tuo IP.
- **🔀 Proxy consigliato**: con un proxy configurato tutto passa da lì, playlist compresa (l'opzione "Forza proxy" non serve più); senza proxy gli stream partono dal dispositivo dell'utente.
- **🐘 PostgreSQL**: database unico per configurazioni, playlist ed EPG (`docker-compose.yml` lo avvia in automatico).

### 🔧 Miglioramenti e sicurezza
- Script Python eseguiti in una cartella dedicata per configurazione, con timeout e senza accesso alle variabili segrete del server.
- Protezione da SSRF (URL verso la rete locale bloccati salvo `ALLOW_PRIVATE_URLS=true`), login con limite di tentativi, Content-Security-Policy, escape automatico dei campi nelle pagine.
- Endpoint `/health` per il monitoraggio e healthcheck Docker.
- I vecchi link `/<base64>/manifest.json` continuano a funzionare e si possono migrare dal wizard.

### 🚀 Versione 7.0.0

### ✨ Nuove funzionalità
- **🔒 Protezione password della home**: Opzione nella web UI per proteggere l’accesso alla pagina di configurazione con una password. Se attivata, chi apre la home (o il link «Configura» da Stremio) deve inserire la password; l’uso dell’addon da Stremio non richiede password.
- **🔄 Sessioni e cache isolate**: La cache è isolata automaticamente per configurazione (stessa config = stessa cache). EPG, Resolver Python e Generatore playlist sono anch'essi per sessione. Più utenti o configurazioni diverse possono usare il server contemporaneamente senza sovrascrivere i dati.
- **🆔 ID Sessione**: In home/config viene mostrato l'**ID Sessione** (derivato dalla configurazione) quando generi una configurazione. L'ID è incluso anche nel backup (export) e viene aggiornato in fase di ripristino (import).
- **⏰ Scadenza sessioni (24h)**: Se una sessione non riceve richieste per **24 ore**, scade automaticamente: tutta la cache di quella sessione (cache M3U, EPG, resolver, generatore) viene eliminata. Alla successiva richiesta con la stessa config la sessione viene ricreata e i dati ripopolati dagli URL.

### 🔧 Miglioramenti
- **🌐 UI in 4 lingue**: L'interfaccia web è disponibile in italiano, inglese, spagnolo e francese; si può cambiare lingua dalla barra in alto a destra.
- **📋 Liste predefinite (opzionale)**: In pagina di configurazione, una sezione permette di aggiungere in un clic le playlist e gli EPG predefiniti di iptv-org e iptv-epg.org per nazione (campi M3U e EPG).
- **⚙️ Sezione Impostazioni**: Nel catalogo è presente un filtro per genere **⚙️** (impostazioni) che raggruppa i canali utility: **Refresh M3U playlist**, **Refresh EPG** e **Rigenera Playlist Python**. Descrizioni e messaggi in inglese.
- **🔄 Pseudo-canali**: Aprendo un canale dalla sezione ⚙️ si esegue l’azione (ricarica playlist, aggiornamento EPG o rigenerazione Python) e si mostra un messaggio di esito; nessun flusso video reale.
- **♻️ Cache al riavvio**: Se la cache è vuota (es. dopo riavvio Docker), la playlist e l’EPG vengono ricostruite automaticamente alla prima richiesta con URL M3U/EPG configurati.
- **📺 EPG e ID canali**: Migliorato l’abbinamento EPG per canali con suffisso (es. `canale5.it` / `canale5`).
- **🔒 UI protezione home**: Con protezione attiva si vede la spunta e il pulsante «Modifica password»; i campi password e conferma compaiono solo cliccando «Modifica password».
- **🔗 Ritorno dopo login**: Dopo aver inserito la password sul gate si viene reindirizzati alla pagina da cui si era partiti (es. pagina di configurazione con URL codificato).

### 🚀 Versione 6.0.0

### 📢 Rebrand del nome
- **📜 OMG+ diventa OMG Premium**: Nuovo nome per differenziare e valorizzare tutte le nuove funzioni disponibili. OMG TV rimane come versione base con canali preimpostati. Non verrà più aggiornata.

### ✨ Nuove funzionalità
- **🐍 Resolver Python**: Sistema completo per risolvere URL di streaming tramite script Python personalizzabili
- **🔄 Canale di rigenerazione**: Nuovo canale nella categoria ~SETTINGS~ per rigenerare la playlist senza accedere al pannello web
- **🛠️ Backup e ripristino**: Sistema per salvare e ripristinare la configurazione completa
- **🔧 Template resolver**: Funzionalità per creare automaticamente template di script resolver personalizzabili
- **👤 User-Agent avanzato**: Gestione migliorata degli header User-Agent, Referer e Origin
- **🧩 Moduli Python**: Supporto integrato per request e altri moduli Python per script avanzati

### 🔧 Miglioramenti
- **🐳 Supporto Docker migliorato**: Configurazioni ottimizzate per Hugging Face e Portainer
- **♻️ Cache intelligente**: Sistema di cache completamente ridisegnato con performance migliorate
- **🔄 Aggiornamento pianificato**: Controllo preciso dell'intervallo di aggiornamento in formato HH:MM
- **📋 Interfaccia web rinnovata**: Pannello di configurazione più intuitivo e ricco di funzionalità
- **⚡ Streaming ottimizzato**: Miglior gestione del fallback tra proxy e stream diretti
- **🛡️ Gestione errori robusta**: Sistema migliorato di gestione errori e tentativi multipli

### 🐛 Correzioni
- **🔄 Risolto il loop infinito**: Corretto il problema del loop infinito con resolver e proxy attivi
- **🔌 Migliorata compatibilità**: Risolti problemi di compatibilità con diverse tipologie di playlist
- **🧰 Fix header HTTP**: Corretta la gestione degli header HTTP personalizzati
- **🔍 Fix ricerca canali**: Migliorata la ricerca dei canali per corrispondenza parziale
- **📊 Ottimizzazione EPG**: Risolti problemi con EPG di grandi dimensioni

## 📝 Note di aggiornamento
- Le configurazioni precedenti NON compatibili rispetto alle installazioni di OMG TV e OMG+ TV.
- Si consiglia di eseguire una nuova installazione da zero su Hugging Face o su VPS (consiglio Portainer)
- Per sfruttare le funzionalità del resolver Python, è necessario configurarlo nella sezione avanzata

Per dettagli completi sul funzionamento delle nuove funzionalità, consulta il manuale utente aggiornato.

## 🚀 Iniziamo: Installazione

### 🐳 Deploy su DOCKER
- Per poter procedere devi prima fare l'installazione tramite docker su Hugging Face o su VPS. Serve un database **PostgreSQL**.
- [Segui la guida qui](docs/DEPLOY.md) (Docker Compose con PostgreSQL e Cloudflare) oppure la [guida rapida](docker-install.md), poi ritorna a questa pagina una volta disponibile il sito web del tuo addon.
- Se tutte queste cose ti sembrano incomprensibili FERMATI; cerca una guida on line su docker, guarda la sezione supporto in basso a questa pagina o chiedi aiuto ad un AI 😊

### 📲 Installazione dell'addon
1. Apri la pagina web di OMG Premium TV e scegli **Crea configurazione**
2. Segui i passaggi del wizard e scegli una password
3. Annota l'**ID** e la password, poi clicca su **INSTALLA SU STREMIO** 🔘 (con Nuvio: copia l'URL del manifest e aggiungilo tra gli addon)
4. Stremio si aprirà automaticamente e ti chiederà di confermare l'installazione
5. Clicca su **Installa** ✅

## ⚙️ Configurazione di base

### 📋 Configurazione della playlist
- **URL M3U** 📋: Inserisci l'URL della tua playlist M3U/M3U8
  - *Esempio singolo*: `http://example.com/playlist.m3u`
  - *Esempio multiplo*: `http://example.com/playlist1.m3u,http://example.com/playlist2.m3u`
  - 💡 **Novità**: Puoi inserire più URL M3U separandoli con una virgola (,) per combinare più playlist

### 📊 Configurazione EPG
- **URL EPG** 📊: Inserisci l'URL del file EPG (guida elettronica dei programmi)
  - *Esempio singolo*: `http://example.com/epg.xml` o `http://example.com/epg.xml.gz`
  - *Esempio multiplo*: `http://example.com/epg1.xml,http://example.com/epg2.xml`
  - 💡 **Novità**: Puoi inserire più URL EPG separandoli con una virgola (,) per combinare più guide programmi
- **Abilita EPG** ✅: Spunta questa casella per visualizzare le informazioni sui programmi

## 🔍 Utilizzo dell'addon

### 📱 Navigazione nel catalogo
1. Apri Stremio
2. Vai alla sezione **Scopri** 🔍
3. Seleziona **Canali TV** e poi **OMG Premium TV** dalla lista degli addon
4. Vedrai la lista completa dei canali disponibili

### 🎯 Filtraggio dei canali
- **Per genere** 🏷️: Seleziona un genere dal menu a discesa per filtrare i canali
- **Ricerca** 🔍: Usa la funzione di ricerca per trovare canali specifici per nome

### 🎬 Visualizzazione dei dettagli del canale
Clicca su un canale per vedere:
- 📋 Informazioni sul canale
- 📺 Programma attualmente in onda (se EPG abilitato)
- 🕒 Prossimi programmi (se EPG abilitato)
- 🏷️ Categorie del canale

### ▶️ Riproduzione di un canale
- Clicca sul canale e poi sul pulsante **WATCH** ▶️
- Scegli tra le opzioni di stream disponibili:
  - 📺 **Stream Originale**: Lo stream standard dalla playlist
  - 🌐 **Stream Proxy**: Lo stream attraverso un proxy (maggiore compatibilità)
  - 🧩 **Stream Risolto**: Lo stream elaborato da uno script resolver (per canali speciali)

## 🛠️ Impostazioni avanzate

### 🔒 Proteggi accesso alla home
- **Abilita protezione con password** ✅: Se attivi questa opzione, alla prossima visita alla pagina di configurazione (home o link «Configura» da Stremio) sarà richiesta la password. L’addon in Stremio continua a funzionare senza password.
- **Modifica password**: Quando la protezione è attiva vedi «Protezione attiva» e il pulsante **Modifica password**; cliccandolo compaiono i campi per cambiare la password. Per disattivare la protezione togli la spunta e salva (senza inserire password).
- La password si imposta e si modifica solo dalla web UI; non è richiesta per guardare i canali da Stremio.

### 🌐 Configurazione proxy
- **Proxy URL** 🔗: URL del proxy per gli stream (è compatibile solo con [MediaFlow Proxy](https://github.com/mhdzumair/mediaflow-proxy))
- **Password Proxy** 🔑: Password per l'autenticazione del proxy
- **Forza Proxy** ✅: Obbliga tutti gli stream ad utilizzare il proxy

### 🆔 Gestione ID e aggiornamenti
- **ID Suffix** 🏷️: Aggiunge un suffisso agli ID dei canali senza id nella playlist (es. `.it`)
- **Percorso file remapper** 📝: Specifica un file per la rimappatura degli ID EPG
- **Intervallo Aggiornamento** ⏱️: Specifica quanto spesso aggiornare la playlist (formato `HH:MM`)

## 🐍 Funzionalità Python avanzate

### 🔄 Generazione playlist con script Python
1. **URL dello Script Python** 🔗: Inserisci l'URL dello script Python
2. **SCARICA SCRIPT** 💾: Scarica lo script sul server
3. **ESEGUI SCRIPT** ▶️: Esegui lo script per generare la playlist
4. **USA QUESTA PLAYLIST** ✅: Utilizza la playlist generata come sorgente

### ⏱️ Aggiornamento automatico
- Inserisci l'intervallo desiderato (es. `12:00` per 12 ore)
- Clicca su **PIANIFICA** 📅 per attivare gli aggiornamenti automatici
- Clicca su **FERMA** ⏹️ per disattivare gli aggiornamenti

### 🧩 Configurazione Resolver Python
- **URL Script Resolver** 🔗: Inserisci l'URL dello script resolver
- **Abilita Resolver Python** ✅: Attiva l'utilizzo del resolver
- **SCARICA SCRIPT** 💾: Scarica lo script resolver
- **CREA TEMPLATE** 📋: Crea un template di script resolver da personalizzare
- **VERIFICA SCRIPT** ✅: Controlla che lo script resolver funzioni correttamente
- **PULISCI CACHE** 🧹: Svuota la cache del resolver

## 💾 Backup e ripristino

### 📤 Backup configurazione
1. Clicca su **BACKUP CONFIGURAZIONE** 💾
2. Un file JSON verrà scaricato con tutte le tue impostazioni (incluso l'**ID Sessione** della config corrente)

### 📥 Ripristino configurazione
1. Clicca su **RIPRISTINA CONFIGURAZIONE** 📤
2. Seleziona il file JSON precedentemente salvato
3. Attendi il completamento del ripristino (l'ID Sessione in pagina si aggiorna in base alla config ripristinata)

## ❓ Risoluzione problemi

### ⚠️ Stream non funzionanti
- Prova ad attivare l'opzione **Forza Proxy** ✅
- Verifica che l'URL della playlist sia corretto
- Prova a utilizzare uno script resolver Python per canali problematici

### 📊 Problemi con EPG
- Verifica che l'URL dell'EPG sia corretto
- Controlla che l'opzione **Abilita EPG** ✅ sia attivata
- Assicurati che gli ID dei canali corrispondano tra playlist ed EPG

### 🐍 Problemi con script Python
- Controlla che Python sia installato sul server dell'addon
- Verifica lo stato dello script nella sezione **Stato Script Python**
- Prova a scaricare nuovamente lo script

## 🔄 Aggiornamenti e manutenzione

### 🔄 Modifica delle impostazioni
- In Stremio, vai su **Impostazioni** ⚙️ > **Addon**
- Clicca su **Configura** 🔄 accanto a OMG Premium TV
- Accedi alla pagina di configurazione, fai le modifiche che ti interessano
- Premi su **Genera Configurazione**
- Onde evitare un doppione rimuovi l'addon su Stremio
- Torna alla pagina di configurazione e clicca **Installa su Stremio**

### 🔧 Rigenerazione playlist e aggiornamenti rapidi
- Nella sezione **⚙️** (filtro per genere in catalogo) trovi: **Refresh M3U playlist** (ricarica dalla sorgente), **Refresh EPG** (aggiorna la guida programmi), **Rigenera Playlist Python** (esegue lo script e ricarica la playlist). Apri il canale e segui il messaggio a schermo.

## 📋 Riepilogo delle funzionalità principali

- ✅ Supporto playlist M3U/M3U8
- ✅ Supporto guide programmi EPG (XMLTV)
- ✅ Filtri per genere e ricerca
- ✅ Proxy per maggiore compatibilità
- ✅ Resolver Python per stream speciali
- ✅ Generazione playlist personalizzate
- ✅ Aggiornamenti automatici
- ✅ Backup e ripristino configurazione
- ✅ Protezione password della pagina di configurazione (opzionale)
- ✅ Cache isolata per configurazione (accessi simultanei)
- ✅ ID Sessione visibile e incluso in export/import
- ✅ Scadenza automatica sessioni inattive (24h) per liberare spazio
- Specifiche tecniche nel [wiki](https://github.com/mccoy88f/OMG-Premium-TV/wiki/Tech-Spec-%E2%80%90-Specifiche-Teniche)

## 📱 Compatibilità

OMG PremTV funziona su tutte le piattaforme supportate da Stremio:
- 💻 Windows
- 🍎 macOS
- 🐧 Linux
- 📱 Android
- 📱 iOS (tramite browser web)
- 📺 Android TV
- 📺 Apple TV

## 👥 Community
- Se cerchi supporto, guide o informazioni sul mondo OMG, MediaFlow Proxy e Stremio puoi visitare:
- [Reddit (Team Stremio Italia)](https://www.reddit.com/r/Stremio_Italia/)
- [Gruppo Telegram](http:/t.me/Stremio_ITA)

## 👏 Ringraziamenti
- FuriousCat per l'idea del nome OMG
- Team di Stremio Italia
- Comunità Telegram (vedi sezione Community)
- Iconic Panda per l'[icona](https://www.flaticon.com/free-icon/tv_18223703?term=tv&page=1&position=2&origin=tag&related_id=18223703)
- [Video di Background](https://it.vecteezy.com/video/1803236-no-signal-bad-tv) del frontend e per i flussi dummy creato da igor.h (su Vecteezy) 

## 📜 Licenza
Progetto rilasciato sotto licenza MIT.


---

📚 **Nota importante**: OMG Premium TV è progettato per accedere a contenuti legali. Nell'addon non sono inclusi canali o flussi. Assicurati di rispettare la normativa del tuo paese riguardo lo streaming di contenuti.

🌟 Grazie per aver scelto OMG Premium TV! Goditi la visione! 🌟
