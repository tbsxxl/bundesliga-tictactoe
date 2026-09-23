# Bundesliga Tic Tac Toe

Fußball-Quiz für zwei: Jedes Feld liegt zwischen zwei Bundesliga-Vereinen – nenne einen Spieler, der für **beide** gespielt hat. Wer zuerst eine Reihe hat, gewinnt.

Läuft auf **Cloudflare Workers** (statische Assets + kleiner API-Worker).

## Aufbau

```
public/          statische Seite (index.html, style.css, main.js, logos.js, icons, manifest)
src/worker.js    Worker: /api/tm-Proxy zu Transfermarkt (via r.jina.ai) mit Edge-Cache
wrangler.jsonc   Cloudflare-Konfiguration
```

- Statische Dateien werden direkt vom Cloudflare-CDN ausgeliefert; der Worker läuft nur für `/api/*`.
- `/api/tm?path=…` akzeptiert ausschließlich Transfermarkt-Such- und Spielerpfade (kein offener Proxy) und cached Antworten 6 h (Suche) bzw. 24 h (Spielerprofile).
- Ohne Worker (z. B. lokal per `file://` oder GitHub Pages) fällt die Seite automatisch auf direkte r.jina.ai-Abfragen zurück.

## Lokal starten

```bash
npm install
npm run dev        # http://localhost:8787
```

## Deployen

Einmalig:

```bash
npx wrangler login
npm run deploy     # → https://bundesliga-tictactoe.<dein-account>.workers.dev
```

Optional für höhere r.jina.ai-Limits: `npx wrangler secret put JINA_API_KEY`

### Automatisch über GitHub Actions

Bei jedem Push auf `main` deployt `.github/workflows/deploy.yml`. Dafür im Repo unter *Settings → Secrets and variables → Actions* anlegen:

- `CLOUDFLARE_API_TOKEN` – Token mit der Vorlage „Edit Cloudflare Workers“
- `CLOUDFLARE_ACCOUNT_ID` – steht im Cloudflare-Dashboard rechts in der Übersicht

Eigene Domain: Cloudflare-Dashboard → Workers & Pages → *bundesliga-tictactoe* → Settings → Domains & Routes.
