# Deploy (VPS)

## Lokaal met Docker Desktop

1. Zorg dat `.env.local` klopt (`AUTH_PASSWORD`, `AUTH_SECRET`, SMTP/IMAP keys).
2. Stop een eventuele losse `mail-postgres` container als poort 5434 bezet is.
3. Start:

```bash
docker compose up -d --build
```

App: http://localhost:3000  
Postgres data blijft in Docker volume `mail_pgdata`.

## VPS (Linux)

1. Installeer Docker + Docker Compose.
2. Kopieer het project (zonder `node_modules` / `.next`).
3. Maak `.env.local` op de server met sterke secrets.
4. Zet:

```env
AUTH_SECURE=true
POSTGRES_PASSWORD=sterk-db-wachtwoord
```

5. Zet een reverse proxy (Caddy/nginx) met HTTPS naar `localhost:3000`.
6. Start:

```bash
docker compose up -d --build
```

7. Open alleen poort 80/443 publiek. Poort 5434 hoef je niet te exposen op de VPS
   (haal desnoods `ports:` onder `db` weg in `docker-compose.yml`).

## Handig

```bash
docker compose logs -f app
docker compose exec db pg_dump -U mail mail > backup.sql
docker compose down
```
