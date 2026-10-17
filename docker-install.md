# 🐳 Installazione di OMG Premium TV tramite Docker
***[🇮🇹 Leggi in italiano](README.md)*** - ***[🇬🇧 Read in English](docker-install-en.md)*** - ***[🇫🇷 Lire en Français](docker-install-fr.md)*** - ***[🇪🇸 Leer en español](docker-install-es.md)***

> ℹ️ **Versione 8**: serve un database **PostgreSQL**. Il modo più semplice è `docker compose up -d` con il file
> [docker-compose.yml](docker-compose.yml) (addon + PostgreSQL + Cloudflare Tunnel). Guida completa: [docs/DEPLOY.md](docs/DEPLOY.md).

## 🖥️ Perché usare Docker?

Installare OMG Premium TV tramite Docker offre diversi vantaggi:
- 🔒 Isolamento dell'applicazione
- 🔄 Facile aggiornamento
- 📦 Nessun conflitto con altre applicazioni
- 🚀 Deployment rapido su qualsiasi piattaforma

## 🌐 Opzione 1: Installazione su VPS con Portainer

[Portainer](https://www.portainer.io/) è un'interfaccia grafica per gestire facilmente i container Docker.

### 📋 Prerequisiti
- Un VPS con Docker e Portainer installati
- Accesso all'interfaccia web di Portainer

### 🚀 Procedura di installazione

1. **Accedi a Portainer** 🔑
   - Apri il browser e vai all'indirizzo del tuo server Portainer (tipicamente `http://tuo-server:9000`)
   - Inserisci le credenziali di accesso

2. **Crea uno Stack** 📚
   - Nel menu laterale, vai su **Stacks**
   - Clicca su **+ Add stack**
   - Assegna un nome allo stack (es. `omg-premium-tv`)

3. **Configura lo Stack** ⚙️
   - Nella sezione "Web editor", incolla il seguente file [docker-compose.portainer](docker-compose.portainer) presente nella repository (addon + PostgreSQL).
   - In **Environment variables** aggiungi `POSTGRES_PASSWORD`, `ADMIN_PASSWORD` e `PUBLIC_BASE_URL`.

4. **Avvia lo Stack** ▶️
   - Clicca sul pulsante **Deploy the stack**
   - Portainer creerà e avvierà automaticamente il container

5. **Accedi all'Addon** 🌐
   - Una volta avviato, accedi all'interfaccia web di OMG Premium TV all'indirizzo:
   - `http://tuo-server:10000` (pannello admin: `http://tuo-server:10000/admin`)

## 🤗 Opzione 2: Installazione su Hugging Face Spaces

[Hugging Face Spaces](https://huggingface.co/spaces) è una piattaforma che permette di ospitare applicazioni web gratuitamente.

### 📋 Prerequisiti
- Un account su Hugging Face

### 🚀 Procedura di installazione

1. **Accedi a Hugging Face** 🔑
   - Vai su [https://huggingface.co/](https://huggingface.co/)
   - Accedi al tuo account o creane uno nuovo

2. **Crea un nuovo Space** 🆕
   - Clicca su **New Space**
   - Scegli un nome per il tuo space (es. `omg-premium-tv`)
   - Seleziona **Docker** come tipo di Space
   - Scegli la visibilità (pubblica o privata)
   - Clicca su **Create Space**

3. **Configura il Dockerfile** 📝
   - Crea un nuovo file chiamato `Dockerfile`
   - Incolla il contenuto del file [Dockerfile.hf](Dockerfile.hf) presente nella repository.
   - In **Settings → Variables and secrets** aggiungi i secret `DATABASE_URL` (PostgreSQL esterno, es. Neon o Supabase gratuiti, con `?sslmode=require`), `ADMIN_PASSWORD` e `PUBLIC_BASE_URL`.

4. **Commit e Avvia il Deployment** 📤
   - Clicca su **Commit changes to main**
   - Hugging Face avvierà automaticamente il processo di build e deployment

5. **Accedi all'Addon** 🌐
   - Una volta completato il deployment, accedi all'interfaccia web di OMG Premium TV all'URL:
   - `https://huggingface.co/spaces/tuo-username/omg-premium-tv`

## ⚙️ Configurazione dell'Addon

Dopo aver installato l'addon tramite Docker, segui questi passaggi per configurarlo:

1. **Accedi all'interfaccia web** 🌐
   - Apri il browser e vai all'URL del tuo addon (VPS o Hugging Face)

2. **Crea la configurazione** 📋
   - Clicca su **Crea configurazione** e segui i passaggi (playlist, guida TV, proxy, avanzate, password)

3. **Copia l'URL del manifest** 📝
   - L'URL ha la forma `https://tuo-server/c/<ID>/manifest.json`
   - Clicca su **COPIA URL MANIFEST**
   - Oppure clicca su **INSTALLA SU STREMIO** se stai usando lo stesso dispositivo

4. **Aggiungi l'addon a Stremio** ➕
   - Apri Stremio
   - Vai su **Impostazioni** > **Addon**
   - Clicca su **Aggiungi addon**
   - Incolla l'URL del manifest
   - Clicca su **Installa**

## 🔧 Manutenzione del container Docker

### 🔄 Aggiornamento dell'addon
Per aggiornare l'addon all'ultima versione:

#### Su Portainer:
1. Vai allo stack di OMG Premium TV
2. Clicca su **Stop** per fermare lo stack
3. Clicca su **Remove** per rimuovere i container
4. Clicca su **Deploy** per ricreare i container con l'ultima versione

#### Su Hugging Face:
1. Modifica il Dockerfile
2. Aggiorna il parametro `BRANCH` se necessario
3. Commit le modifiche per avviare il rebuild

### 📊 Monitoraggio dei log
Per visualizzare i log dell'addon:

#### Su Portainer:
1. Vai alla sezione **Containers**
2. Trova il container `omg-premium-tv`
3. Clicca sul nome del container
4. Vai alla scheda **Logs**

#### Su Hugging Face:
1. Vai al tuo Space
2. Clicca sulla scheda **Factory**
3. Visualizza i log nella sezione in basso

## ⚠️ Risoluzione problemi Docker

### 🛑 Il container non si avvia
- Verifica che le porte non siano già in uso
- Controlla i log per eventuali errori
- Assicurati che Docker abbia sufficienti risorse (CPU/RAM)

### 🔌 Addon non raggiungibile
- Verifica che il firewall permetta il traffico sulla porta dell'addon (10000, oppure 7860 su Hugging Face)
- Controlla `DATABASE_URL`: senza database l'addon non si avvia
- Controlla che il container sia in esecuzione
- Verifica che HOST e PORT siano impostati correttamente

### 📵 Problemi di rete
- Assicurati che il container abbia accesso a internet
- Verifica che non ci siano restrizioni di rete sulle chiamate esterne

### 💾 Problemi di persistenza
- Per mantenere i dati tra i riavvii, puoi provare ad aggiungere volumi dedicati nel docker-compose

```yaml
volumes:
  - ./data:/app/data
  - ./temp:/app/temp
```

Questo garantirà che la configurazione e i file temporanei vengano mantenuti anche dopo il riavvio del container.

Se hai seguito tutti i passaggi e non hai errori, [puoi ora tornare alla guida principale](README.md)
