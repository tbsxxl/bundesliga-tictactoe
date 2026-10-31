# Bundesliga Tic Tac Toe

Fußball-Quiz für zwei: Jedes Feld liegt zwischen zwei Bundesliga-Vereinen – nenne einen Spieler, der für **beide** gespielt hat. Wer zuerst eine Reihe hat, gewinnt.

Läuft auf **Cloudflare Workers** (statische Assets + kleiner API-Worker).

## Aufbau

```
public/          statische Seite (index.html, style.css, main.js, logos.js, icons, manifest)
src/worker.js    Worker: /api/tm (Transfermarkt), /api/names (Wikidata), /api/img (Bilder) – alles mit Edge-Cache
wrangler.jsonc   Cloudflare-Konfiguration
```

- Statische Dateien werden direkt vom Cloudflare-CDN ausgeliefert; der Worker läuft nur für `/api/*`.
- `/api/tm?path=…` akzeptiert ausschließlich Transfermarkt-Such- und Spielerpfade (kein offener Proxy) und cached Antworten 6 h (Suche) bzw. 24 h (Spielerprofile).
  Transfermarkt wird direkt abgefragt; antwortet es nicht innerhalb von 1,2 s, läuft r.jina.ai parallel. Diagnose: `/api/tm-diagnose?q=Name`.
- `/api/names?q=…` liefert sofortige Namensvorschläge über die Wikidata-Suche (gefiltert auf Fußballspieler, 7 Tage gecacht); Transfermarkt ergänzt im Hintergrund die IDs für die Prüfung.
- `/api/img?src=…` lädt Vereinslogos (Wikimedia) und Spielerfotos (Transfermarkt) serverseitig und cached sie 30 Tage – Nutzer-IPs gehen nicht an Dritte. Die Content-Security-Policy in `public/_headers` erzwingt, dass der Browser nur mit der eigenen Domain spricht.
- Design im iOS-Stil („Liquid Glass“): iOS-Systemfarben, Systemschrift (SF Pro auf Apple-Geräten), schwebende Glas-Toolbar.
- `public/rechtliches.html` enthält Impressum und Datenschutzerklärung – **die Platzhalter `[…]` im Impressum vor dem Livegang ausfüllen.**
- Ohne Worker (z. B. lokal per `file://` oder GitHub Pages) fällt die Seite automatisch auf direkte r.jina.ai-Abfragen zurück.

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:8787
```

## Deployen (ohne lokale Installation)

1. Im [Cloudflare-Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Import a repository**.
2. GitHub verbinden und `tbsxxl/bundesliga-tictactoe` auswählen.
3. Einstellungen übernehmen (Cloudflare erkennt `wrangler.jsonc`; Deploy-Befehl `npx wrangler deploy`) → **Deploy**.

Danach deployt Cloudflare bei jedem Push auf den Produktions-Branch automatisch.
Die URL lautet `https://bundesliga-tictactoe.<dein-account>.workers.dev`; eigene Domain unter
Worker → Settings → Domains & Routes.

Optional für höhere r.jina.ai-Limits: im Worker unter Settings → Variables and Secrets ein Secret `JINA_API_KEY` anlegen.

### Alternativ lokal

```bash
npm install
npx wrangler login
npm run deploy
```
