# SecureLocker Production-Anleitung

Diese Anleitung beschreibt Schritt für Schritt, wie SecureLocker von einer lokalen Entwicklungsumgebung auf echte Production-Links umgestellt wird.

Ziel-Setup:

- Datenbank: Supabase PostgreSQL
- Backend API: Render Free Web Service
- Website / Download-Seite: Netlify
- Desktop-Releases / Updater: GitHub Releases

Wichtig: Keine echten Secrets in Git committen. Zugangsdaten gehören in Supabase, Render, Netlify oder lokal in nicht versionierte `.env`-Dateien.

## 1. Development vs. Production verstehen

In der Entwicklung darf SecureLocker lokal laufen:

```env
API_BASE_URL=http://127.0.0.1:4100
FRONTEND_URL=http://127.0.0.1:1420
CORS_ORIGIN=http://127.0.0.1:1420
VITE_API_BASE_URL=http://127.0.0.1:4100/api
```

In Production darf die App nicht auf lokale URLs zeigen. Production muss echte öffentliche URLs verwenden:

```env
API_BASE_URL=https://securelocker-api.onrender.com
FRONTEND_URL=https://securelocker.netlify.app
CORS_ORIGIN=https://securelocker.netlify.app
VITE_API_BASE_URL=https://securelocker-api.onrender.com/api
```

Die Namen oben sind Beispiele. Ersetze sie durch deine echten Render- und Netlify-URLs.

## 2. Supabase Datenbank einrichten

1. Öffne Supabase und erstelle ein kostenloses Projekt.
2. Wähle ein sicheres Datenbank-Passwort.
3. Warte, bis das Projekt vollständig erstellt wurde.
4. Öffne im Supabase-Projekt die Datenbank-Verbindungsdaten.
5. Kopiere die PostgreSQL Connection String.

Beispiel:

```env
DATABASE_URL=postgresql://postgres:DEIN_PASSWORT@db.xxxxx.supabase.co:5432/postgres?schema=public&sslmode=require
```

Hinweise:

- `DEIN_PASSWORT` ist nur ein Beispiel. Niemals ein echtes Passwort in Git speichern.
- Wenn Supabase SSL verlangt, nutze `sslmode=require`.
- Diese `DATABASE_URL` wird später in Render als Environment Variable gesetzt.

## 3. Render Backend einrichten

1. Öffne Render.
2. Erstelle einen neuen `Web Service`.
3. Verbinde dein GitHub-Repository.
4. Wähle den Branch, den du deployen möchtest.
5. Verwende diese Einstellungen:

```text
Name: securelocker-api
Runtime: Node
Plan: Free
Build Command: npm ci && npm run build:render
Start Command: npm run prisma:deploy && npm start
Health Check Path: /health
```

Das Backend startet dadurch mit:

```bash
node dist/server/index.js
```

Render setzt automatisch `PORT`. Die API muss deshalb auf `process.env.PORT` hören.

## 4. Render Environment Variables setzen

Öffne in Render den Bereich `Environment` und setze alle Backend-Variablen.

Beispiel:

```env
NODE_ENV=production
API_BASE_URL=https://securelocker-api.onrender.com
FRONTEND_URL=https://securelocker.netlify.app
CORS_ORIGIN=https://securelocker.netlify.app
DATABASE_URL=postgresql://postgres:DEIN_PASSWORT@db.xxxxx.supabase.co:5432/postgres?schema=public&sslmode=require
JWT_SECRET=LANGER_ZUFAELLIGER_SECRET_WERT
AUTH_TOKEN_PEPPER=WEITERER_LANGER_ZUFAELLIGER_SECRET_WERT
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=dein-smtp-user
SMTP_PASS=dein-smtp-passwort
SMTP_FROM=SecureLocker <security@example.com>
```

Wichtig:

- `JWT_SECRET`, `AUTH_TOKEN_PEPPER`, `SMTP_PASS` und `DATABASE_URL` sind Secrets.
- Diese Werte nicht in Git committen.
- SMTP-Werte gehören nur ins Backend auf Render.
- Die Frontend-App darf niemals SMTP-Zugangsdaten enthalten.

## 5. Netlify Website einrichten

1. Öffne Netlify.
2. Erstelle eine neue Site aus deinem GitHub-Repository.
3. Verwende diese Build-Einstellungen:

```text
Build Command: npm run build
Publish Directory: dist
```

4. Setze in Netlify unter `Environment variables`:

```env
VITE_API_BASE_URL=https://securelocker-api.onrender.com/api
```

Wichtig:

- Diese URL muss auf deine echte Render-API zeigen.
- Sie muss mit `/api` enden.
- Keine localhost-URL in Netlify setzen.

## 6. `.env.production` richtig befüllen

Für lokale Production-Builds kannst du `.env.production` verwenden.

Beispiel:

```env
API_BASE_URL=https://securelocker-api.onrender.com
FRONTEND_URL=https://securelocker.netlify.app
CORS_ORIGIN=https://securelocker.netlify.app
VITE_API_BASE_URL=https://securelocker-api.onrender.com/api
```

Wenn du zusätzlich lokal Backend-Production-Checks machst, brauchst du auch:

```env
NODE_ENV=production
DATABASE_URL=postgresql://postgres:DEIN_PASSWORT@db.xxxxx.supabase.co:5432/postgres?schema=public&sslmode=require
JWT_SECRET=LANGER_ZUFAELLIGER_SECRET_WERT
AUTH_TOKEN_PEPPER=WEITERER_LANGER_ZUFAELLIGER_SECRET_WERT
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=dein-smtp-user
SMTP_PASS=dein-smtp-passwort
SMTP_FROM=SecureLocker <security@example.com>
```

Hinweis: `.env.production` kann echte Secrets enthalten, wenn du lokal testest. Deshalb darf sie nicht committed werden.

## 7. Prisma Migration auf Supabase ausführen

Render führt beim Start automatisch aus:

```bash
npm run prisma:deploy
```

Wenn du die Migration vorher manuell testen möchtest, setze lokal zuerst die Supabase `DATABASE_URL` und führe aus:

```bash
npm run prisma:generate
npm run prisma:deploy
```

Für Production immer `prisma migrate deploy` verwenden, nicht `prisma migrate dev`.

Unterschied:

- `npm run prisma:migrate` ist für lokale Entwicklung.
- `npm run prisma:deploy` ist für Production-Datenbanken.

## 8. Production Build erstellen

Frontend builden:

```bash
npm run build
```

Backend builden:

```bash
npm run build:api
```

Render-Build lokal simulieren:

```bash
npm run build:render
```

Nach dem Build prüfen, ob keine lokalen URLs im Production-Bundle stehen:

```bash
rg "127\.0\.0\.1|localhost" dist
```

Wenn der Befehl keine Treffer ausgibt, ist das gut.

## 9. Desktop App mit Production API bauen

Die Desktop-App verwendet den Vite Production Build. Deshalb muss vor dem Desktop-Build `VITE_API_BASE_URL` auf die echte Render-API zeigen.

Beispiel:

```env
VITE_API_BASE_URL=https://securelocker-api.onrender.com/api
```

Dann bauen:

```bash
npm run build:desktop
npm run release:build
```

Wichtig:

- Die Production-Desktop-App darf nicht auf `127.0.0.1` oder `localhost` zeigen.
- Der API-Client muss die Render-URL verwenden.
- Development darf weiter lokal laufen.

## 10. GitHub Release und Updater beachten

SecureLocker verwendet GitHub Releases für Updates.

Der Updater erwartet die Datei:

```text
https://github.com/amirhb259/SecureLocker/releases/latest/download/latest.json
```

Für ein Release brauchst du normalerweise:

- die gebaute Setup-Datei, zum Beispiel `SecureLocker_0.1.2_x64-setup.exe`
- die passende `.sig` Signaturdatei
- `latest.json`

`latest.json` kann mit dem vorhandenen Script erzeugt werden:

```bash
npm run release:latest-json
```

Danach diese Dateien im passenden GitHub Release hochladen.

Wichtig:

- Updater-URLs dürfen nicht auf localhost zeigen.
- Die Version in `VERSION.txt`, Tauri-Konfiguration und Release-Dateien sollte zusammenpassen.
- GitHub Release Assets müssen öffentlich erreichbar sein, damit der Updater sie laden kann.

## 11. Deployment-Reihenfolge

Empfohlene Reihenfolge:

1. Supabase-Projekt erstellen.
2. Supabase `DATABASE_URL` kopieren.
3. Render Web Service erstellen.
4. Render Environment Variables setzen.
5. Render deployen.
6. Render Health Check testen.
7. Netlify Site erstellen.
8. Netlify `VITE_API_BASE_URL` setzen.
9. Netlify deployen.
10. `FRONTEND_URL` und `CORS_ORIGIN` in Render auf die echte Netlify-URL setzen.
11. Render neu deployen.
12. Production-Website testen.
13. Desktop-App mit Production API bauen.
14. GitHub Release mit Updater-Dateien veröffentlichen.

## 12. Test-Checkliste

Backend:

- [ ] Render Service ist online.
- [ ] `https://securelocker-api.onrender.com/health` gibt `{ "ok": true, "service": "SecureLocker API" }` zurück.
- [ ] Render Logs zeigen keine fehlenden Environment Variables.
- [ ] Prisma Migration wurde gegen Supabase ausgeführt.
- [ ] Supabase enthält die Prisma-Tabellen.
- [ ] Login-Endpunkt ist erreichbar.
- [ ] CORS erlaubt die Netlify-URL.
- [ ] CORS verwendet keinen Wildcard-Zugriff für authentifizierte Routen.
- [ ] SMTP-Testmail kommt an.
- [ ] SMTP-Secrets sind nicht im Frontend-Bundle.

Frontend:

- [ ] Netlify Build läuft erfolgreich durch.
- [ ] `VITE_API_BASE_URL` zeigt auf die Render-API mit `/api`.
- [ ] Registrierung funktioniert.
- [ ] E-Mail-Verifikation funktioniert.
- [ ] Login funktioniert.
- [ ] 2FA funktioniert, falls aktiviert.
- [ ] Neue Geräte/IPs lösen eine Approval-Mail aus.
- [ ] Nach Device Approval wird nicht automatisch eine falsche 2FA-Session erzeugt.

Desktop:

- [ ] Desktop Production Build wurde mit Render API gebaut.
- [ ] Desktop Login nutzt die öffentliche API.
- [ ] Kein localhost im Production-Bundle:

```bash
rg "127\.0\.0\.1|localhost" dist
```

- [ ] GitHub Release enthält Setup-Datei, `.sig` und `latest.json`.
- [ ] Updater-URL zeigt auf GitHub Releases.

Sicherheit:

- [ ] `.env`-Dateien mit echten Secrets sind nicht committed.
- [ ] `DATABASE_URL` ist nur in Render oder lokal gesetzt.
- [ ] SMTP-Zugangsdaten sind nur in Render gesetzt.
- [ ] `JWT_SECRET` und `AUTH_TOKEN_PEPPER` sind lang und zufällig.
- [ ] Render und Netlify verwenden echte öffentliche URLs.
- [ ] Production enthält keine localhost API URL.
