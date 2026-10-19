# 🚀 Deploy di OMG Premium TV 8

Questa guida copre l'installazione della versione 8: server multi-utente con database PostgreSQL,
pannello di amministrazione e, facoltativamente, Cloudflare davanti al server per nasconderne l'indirizzo.

## Cosa serve

- **Docker** (consigliato), oppure Node.js 20+ e Python 3
- **PostgreSQL 14+**: è l'unico database supportato. Con `docker-compose.yml` viene creato in automatico;
  in cloud vanno bene anche i piani gratuiti di Neon, Supabase o Aiven (usa `?sslmode=require` nell'URL)
- **Facoltativo**: un dominio su Cloudflare, per Tunnel o Worker

## 1. Installazione con Docker Compose (consigliata)

```bash
git clone https://github.com/mccoy88f/OMG-Premium-TV.git
cd OMG-Premium-TV
docker compose up -d
```

Non serve configurare nulla: il database PostgreSQL è incluso nello stack (non è esposto fuori da Docker)
e l'addon risponde su `http://<server>:10000`. Per personalizzare (password admin, URL pubblico, Cloudflare)
copia `.env.example` in `.env` e modifica i valori, poi ripeti `docker compose up -d`.

Lo stack avvia quattro servizi:

| Servizio | Ruolo |
|---|---|
| `addon` | l'addon (porta interna 10000, non esposta su Internet) |
| `db` | PostgreSQL con i dati in un volume |
| `warp` | Cloudflare WARP: tutto ciò che il server scarica esce da qui, mai dal tuo IP |
| `cloudflared` | Cloudflare Tunnel (facoltativo, profilo `tunnel`): pubblica l'addon sul tuo dominio senza aprire porte |

Con Cloudflare Tunnel: metti `CLOUDFLARE_TUNNEL_TOKEN` e `ADDON_BIND=127.0.0.1` nel `.env` e avvia con
`docker compose --profile tunnel up -d`. Con `ADDON_BIND=127.0.0.1` la porta 10000 non è raggiungibile da fuori:
si entra solo dal tunnel.

Nei docker-compose il **generatore playlist e il resolver Python sono disattivati** (`PYTHON_ENABLED=false`):
eseguono sul server codice scaricato da URL. Per attivarli metti `PYTHON_ENABLED=true` nel file `.env`;
poi l'admin può comunque spegnerli dal pannello.

## 2. Primo accesso

- Apri `PUBLIC_BASE_URL/admin`. Se non hai impostato `ADMIN_PASSWORD`, la password generata al primo avvio
  è stampata **una sola volta** nel log (`docker compose logs addon`): cambiala subito dal pannello.
- Dalla home `PUBLIC_BASE_URL/` gli utenti creano la propria configurazione con il wizard a passaggi
  (playlist → guida TV → proxy → avanzate → password). Alla fine ricevono:
  - un **ID** e l'URL da installare: `https://tuodominio/c/<ID>/manifest.json` (nessun parametro nell'URL)
  - la **password** scelta, che serve per modificare la configurazione da qualsiasi dispositivo

### Pannello admin

- elenco di tutte le configurazioni (nome, sorgenti, funzioni attive, ultimo accesso), con filtro;
  si possono **cancellare una o più configurazioni** (anche "seleziona inattive da 30+ giorni")
- sorgenti EPG condivise: stato, numero di canali e programmi, aggiornamento manuale, eliminazione
- playlist condivise in cache
- password di accesso per la creazione di nuove configurazioni (per un'istanza privata)
- abilitazione degli script Python per gli utenti

## 3. Cloudflare: nascondere il server

L'obiettivo è che né gli URL delle configurazioni né il traffico rivelino l'indirizzo reale del server.

### Opzione A: Cloudflare Tunnel (VPS / casa)

1. Cloudflare Zero Trust → Networks → Tunnels → crea un tunnel di tipo **cloudflared**
2. Copia il token in `CLOUDFLARE_TUNNEL_TOKEN` (file `.env`)
3. Aggiungi un *Public hostname* (es. `tv.tuodominio.it`) con servizio `http://addon:10000`
4. Imposta `PUBLIC_BASE_URL=https://tv.tuodominio.it` e `ADDON_BIND=127.0.0.1`
5. Avvia con `docker compose --profile tunnel up -d`

Il server non espone porte: l'unico modo di raggiungerlo è attraverso Cloudflare.

### Opzione B: Cloudflare Worker (Render, Hugging Face, altri hosting)

Il Worker in `cloudflare/worker.js` fa da proxy inverso: Stremio vede solo il dominio del Worker.

```bash
cd cloudflare
npx wrangler deploy
npx wrangler secret put ORIGIN_URL      # es. https://omg-tv-xxxx.onrender.com
npx wrangler secret put ORIGIN_SECRET   # una stringa casuale lunga
```

Sul server imposta:

- `ORIGIN_SECRET` con lo stesso valore: le richieste che non passano dal Worker ricevono **403**
- `PUBLIC_BASE_URL` con l'URL del Worker (o il dominio personalizzato del Worker)

### Uscita del server: WARP

Cloudflare Tunnel/Worker nasconde il server a **chi si collega**, ma non a **chi riceve le sue richieste**:
chi inserisce una playlist o un proxy su un proprio server vedrebbe da quale IP arrivano i download.
Per questo nel compose tutto ciò che il server scarica esce da Cloudflare WARP:

- `OUTBOUND_PROXY=http://warp:8080` (oppure `socks5://warp:1080`)
- `OUTBOUND_PROXY_REQUIRED=true`: nessuna connessione diretta. Se WARP non risponde i download falliscono,
  invece di uscire con il tuo IP. Il nome del sito viene risolto da WARP, quindi neanche la richiesta DNS
  parte dal server.
- Il pannello admin mostra da dove esce il server (`warp=on`, IP di uscita) grazie a
  `https://www.cloudflare.com/cdn-cgi/trace`, controllato all'avvio e ogni 10 minuti.

Il container `warp` (cartella `warp/`) registra un dispositivo WARP gratuito al primo avvio e usa `wireproxy`
in userspace: niente privilegi, `NET_ADMIN` o `/dev/net/tun`. Con una chiave WARP+ imposta `WARP_LICENSE_KEY`.
Restano dirette solo le connessioni interne (database) e, con `ALLOW_PRIVATE_URLS=true`, gli indirizzi in LAN.

Alcune sorgenti bloccano gli IP di Cloudflare: in quel caso la playlist va scaricata con il proxy
dell'utente (vedi sotto) o da un'altra uscita impostata in `OUTBOUND_PROXY`.

### Chi vede quale IP

| Chi | Con proxy dell'utente | Senza proxy |
|---|---|---|
| Sorgente della playlist | IP del proxy dell'utente | IP di WARP |
| Sorgenti degli stream | IP del proxy dell'utente | IP dell'utente (il player si collega direttamente) |
| Fonti EPG | IP di WARP | IP di WARP |
| Proxy dell'utente | IP di WARP | — |
| Utenti dell'addon | dominio Cloudflare | dominio Cloudflare |

Il tuo IP non compare in nessuna riga.

### Stream mascherati

Con `STREAM_MASKING=true` (predefinito) e l'opzione "Nascondi gli URL reali degli stream" attiva nella
configurazione, Stremio/Nuvio ricevono link del tipo `https://tuodominio/s/<token>`. Il token è **cifrato**
(AES-256-GCM): contiene l'URL reale (proxy, password del proxy, sorgente) che non è leggibile e non compare
nelle risposte dell'addon. Il server risponde con un redirect alla destinazione.

Limiti da conoscere: il player segue il redirect, quindi l'indirizzo finale passa comunque in rete dal
dispositivo dell'utente; con un proxy, inoltre, i segmenti del video sono serviti dal proxy stesso.

## 4. Proxy: MediaFlow ed EasyProxy (consigliato)

Il proxy è **consigliato, non obbligatorio**. Quando l'utente ne configura uno, **tutto passa dal proxy**:

- il download della playlist (e del file di remapping), con `/proxy/stream?d=`
- ogni stream: nel catalogo compaiono solo i link via proxy. Se il proxy non riesce ad aprire uno stream
  viene offerto il link diretto, segnalato con ⚠️ (parte dall'IP dell'utente)

Senza proxy gli stream sono diretti (il player dell'utente si collega alla sorgente) e la playlist la scarica
il server, via WARP. L'opzione "Forza proxy" non esiste più: con un proxy è sempre attiva.

Nel passaggio "Proxy" del wizard si può scegliere il tipo oppure lasciarlo **automatico**: l'addon interroga
`/api/info` e riconosce [EasyProxy](https://github.com/realbestia1/EasyProxy) (altrimenti usa il formato
[MediaFlow Proxy](https://github.com/mhdzumair/mediaflow-proxy)). Il pulsante "Verifica proxy" mostra tipo,
versione, se la password è corretta (`/proxy/ip`) e, se il proxy lo comunica, il suo IP di uscita.

EasyProxy riscrive ogni file che inizia con `#EXTM3U`, anche le playlist IPTV: l'addon ripristina gli URL
originali dal parametro `d`, quindi la playlist resta identica alla sorgente.

**WARP sui proxy**: EasyProxy ha WARP integrato (si attiva dal suo pannello). MediaFlow no, ma può uscire dal
container WARP con `PROXY_URL=socks5://warp:1080` e `ALL_PROXY=true` (esempio commentato nel compose).
Non attivare entrambi sullo stesso percorso: WARP dentro WARP rallenta e crea problemi di MTU.

| | MediaFlow | EasyProxy |
|---|---|---|
| HLS | `/proxy/hls/manifest.m3u8?d=` | `/proxy/manifest.m3u8?url=` (riconoscimento automatico) |
| DASH | `/proxy/mpd/manifest.m3u8?d=` | `/proxy/manifest.m3u8?url=` |
| DASH ClearKey | `key_id=&key=` | `clearkey=KID:KEY` |
| Estrattori (DLHD, Vavoo…) | `/extractor/video?host=DLHD` per `.php` | automatici sull'endpoint universale |
| Header | `h_user-agent`, `h_referer`, `h_origin` | uguali |

Le chiavi ClearKey vengono lette dalle playlist (`#KODIPROP:inputstream.adaptive.license_key=KID:KEY`).

## 5. Nuvio e altre app compatibili

[Nuvio](https://github.com/tapframe/NuvioStreaming) installa gli addon Stremio con lo stesso URL del manifest.
Gli header necessari alla riproduzione (Referer, Origin, User-Agent) vengono inviati anche nel formato standard
`behaviorHints.proxyHeaders`, che è quello letto da Nuvio e dal server di streaming di Stremio.

## 6. Guide TV predefinite

Nel passaggio "Guida TV" si può aggiungere un EPG predefinito per paese o una guida tematica (beIN, Plex,
Rakuten, DistroTV...). Le guide provengono da [epgshare01](https://epgshare01.online), secondo l'elenco mantenuto
da [Free-TV/IPTV](https://github.com/Free-TV/IPTV/blob/master/epglist.txt); le playlist per paese da
[iptv-org](https://github.com/iptv-org/iptv). L'elenco è in `src/presets.ts`.

Se il campo EPG resta vuoto si usa l'EPG indicato nella playlist (`url-tvg`) e, se manca, quello del paese scelto.
Ogni URL EPG viene scaricato **una volta sola** e condiviso tra tutte le configurazioni che lo usano.

## 7. Variabili d'ambiente

| Variabile | Predefinito | Descrizione |
|---|---|---|
| `DATABASE_URL` | — | **obbligatoria**, `postgres://utente:password@host:5432/db` |
| `PUBLIC_BASE_URL` | dedotto dalla richiesta | URL pubblico (Cloudflare) usato in manifest e link |
| `ADMIN_PASSWORD` | generata | password del pannello `/admin` |
| `APP_SECRET` | generato e salvato nel DB | firma dei cookie e cifratura dei link degli stream |
| `ORIGIN_SECRET` | — | richiede l'header `X-Origin-Secret` (Worker Cloudflare) |
| `TRUST_PROXY` | `1` | numero di proxy fidati davanti al server |
| `STREAM_MASKING` | `true` | consente il mascheramento degli URL degli stream |
| `STREAM_TOKEN_TTL_HOURS` | `12` | validità dei link mascherati |
| `ALLOW_LEGACY_URLS` | `true` | accetta i vecchi URL `/<base64>/manifest.json` |
| `ALLOW_PRIVATE_URLS` | `false` | consente URL verso la rete locale (playlist/proxy in LAN); questi non passano da `OUTBOUND_PROXY` |
| `OUTBOUND_PROXY` | — (`http://warp:8080` nel compose) | proxy di uscita per tutte le richieste del server (`http://` o `socks5://`) |
| `OUTBOUND_PROXY_REQUIRED` | `false` (`true` nel compose) | nessuna connessione diretta: senza proxy funzionante i download falliscono |
| `WARP_LICENSE_KEY` | — | chiave WARP+ per il container `warp` |
| `PYTHON_ENABLED` | `false` nei docker-compose, `true` altrimenti | generatore playlist e resolver Python (disattivabili anche dal pannello) |
| `PYTHON_TIMEOUT_SEC` / `RESOLVER_TIMEOUT_SEC` | `180` / `30` | timeout degli script |
| `TIMEZONE` | `Europe/Rome` | fuso orario degli orari EPG |
| `EPG_REFRESH_HOURS` | `12` | intervallo di aggiornamento delle guide |
| `EPG_FUTURE_DAYS` | `7` | giorni di programmazione conservati |
| `ACTIVE_CONFIG_DAYS` | `14` | oltre questo periodo di inutilizzo le sorgenti EPG non vengono più aggiornate |
| `DATA_DIR` | `./data` | file di lavoro degli script Python |

## 8. Aggiornare da una versione precedente

- I link installati con la versione 7 (`/<base64>/manifest.json`) continuano a funzionare
  (`ALLOW_LEGACY_URLS=true`): vengono registrati come configurazioni "legacy", visibili nel pannello admin.
- Il link "Configura" di quelle installazioni apre il wizard precompilato: salvando si ottiene una nuova
  configurazione con ID e password, da reinstallare in Stremio.
- La vecchia protezione della home (`data/home-auth.json`) non viene importata: usa la password di accesso
  dal pannello admin.

## 9. Sviluppo

```bash
npm install
DATABASE_URL=postgres://... npm run dev   # tsx in watch mode
npm run typecheck
npm test                                  # test che non usano il DB
npm run test:db                           # tutti i test (TEST_DATABASE_URL, lo schema viene ricreato!)
npm run build && npm start                # build di produzione in dist/
```
