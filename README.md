# GymTrack 🏋️

App web per il tracciamento degli allenamenti in palestra. Multi-utente, mobile-first, con timer di recupero e grafici di progressione.

## Funzionalità

- **Account utenti** — registrazione e login con JWT (sessione 30 giorni)
- **Schede** — crea schede in-app o importa file JSON
- **Allenamento attivo** — traccia serie, peso e ripetizioni in tempo reale
- **Timer recupero** — countdown automatico dopo ogni serie con suono
- **Storico** — visualizza e gestisci tutti gli allenamenti passati
- **Grafici** — progressione peso massimo e volume per esercizio

---

## Avvio rapido (locale)

```bash
cd gym-tracker
npm install
npm start
```

L'app sarà disponibile su `http://localhost:3000`

---

## Deploy su Render (gratuito)

1. Crea un account su [render.com](https://render.com)
2. Clicca **New → Web Service**
3. Collega il tuo repository GitHub con questi file
4. Imposta:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
5. Aggiungi le variabili d'ambiente:
   - `JWT_SECRET` → una stringa casuale lunga (es. `openssl rand -hex 32`)
   - `NODE_ENV` → `production`
6. Clicca **Deploy**

> **Nota:** Il piano gratuito di Render mette in pausa il servizio dopo 15 min di inattività. Per uso continuo usa il piano Starter ($7/mese) o un VPS.

---

## Deploy su Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Imposta `JWT_SECRET` nelle variabili d'ambiente del progetto Railway.

---

## Deploy su un VPS (Linux)

```bash
# Installa Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Clona / copia i file
cd /var/www/gym-tracker
npm install

# Avvia con PM2 (process manager)
npm install -g pm2
pm2 start server.js --name gymtrack
pm2 startup && pm2 save

# (opzionale) Nginx reverse proxy sulla porta 80/443
```

---

## Variabili d'ambiente

| Variabile    | Default                          | Descrizione                          |
|--------------|----------------------------------|--------------------------------------|
| `PORT`       | `3000`                           | Porta del server                     |
| `JWT_SECRET` | ⚠️ stringa di default (cambiala!) | Chiave per firmare i token JWT       |
| `DB_PATH`    | `./gym.db`                       | Percorso del database SQLite         |

---

## Importare la scheda

Nella sezione **Schede → Nuova scheda**, usa il pulsante **Importa JSON** e seleziona il file `scheda_upperlower.json` incluso nel pacchetto.

---

## Struttura del progetto

```
gym-tracker/
├── server.js              ← Backend Express + SQLite
├── package.json
├── scheda_upperlower.json ← Scheda pronta da importare
└── public/
    └── index.html         ← Frontend SPA (HTML + CSS + JS)
```

Il database `gym.db` viene creato automaticamente al primo avvio.
