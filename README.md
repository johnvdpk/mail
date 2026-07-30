# Mail Application

Een Next.js-gebaseerde e-mailclient met IMAP-synchronisatie, SMTP-verzending en AI-mogelijkheden.

## Features

- ✉️ **IMAP Inbox Sync** - Real-time synchronisatie van e-mailmappen met threading
- 📤 **SMTP Email Sending** - Verzenden van berichten via je eigen e-mailaccount
- 🤖 **AI Integration** (OpenRouter)
  - AI-gestuurde drafts en mailsuggesties
  - Polish bestaande berichten
  - Tips voor professionele communicatie
  - Inbox sortering en prioritering
- 📅 **Google Calendar** - "Zet in Google Agenda" integratie
- 🔐 **Single-User Authentication** - Web-gebaseerde login met wachtwoord
- 🐳 **Docker Ready** - Complete Docker Compose setup

## Vereisten

- **Node.js** 18.17+ (LTS aanbevolen)
- **PostgreSQL** 14+ (of Docker)
- **npm** of **yarn**
- SMTP/IMAP e-mailaccount (bijv. Gmail, Strato, ProtonMail)
- (Optioneel) OpenRouter AI API key
- (Optioneel) Google OAuth credentials

## Quick Start

### 1. Project klonen en dependencies installeren

```bash
git clone <repository-url>
cd mail
npm install
```

### 2. Environment variabelen configureren

Kopieer `.env.example` naar `.env.local` en vul je instellingen in:

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

**Essentiële variabelen:**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - Je e-mailaccount
- `IMAP_HOST`, `IMAP_PORT` - IMAP instellingen (defaults naar SMTP)
- `AUTH_PASSWORD` - Kies een sterk wachtwoord voor web login
- `DATABASE_URL` - PostgreSQL verbindingsstring

Zie [Environment Variables](#environment-variables) voor details.

### 3. Database starten (Docker)

```bash
# Met Docker Compose (eenvoudig)
docker compose up -d db

# Of lokale PostgreSQL gebruiken
# Zorg dat DATABASE_URL klopt in .env.local
```

### 4. Database initialiseren

```bash
npm run db:migrate
```

### 5. Ontwikkelserver starten

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) en login met je `AUTH_PASSWORD`.

## Development Scripts

| Command | Beschrijving |
|---------|-------------|
| `npm run dev` | Start Next.js dev server (HMR enabled) |
| `npm run build` | Build production bundle |
| `npm run start` | Start production server |
| `npm run db:migrate` | Migrate database schema (lokaal) |
| `npm run db:migrate:prod` | Migrate in productie (Node.js, geen tsx) |
| `npm run test:smtp` | Test SMTP-verbinding met configured account |
| `npm run test:imap` | Test IMAP-verbinding en sync één folder |

## Environment Variables

Zie `.env.example` voor volledige referentie. Hier de belangrijkste:

### SMTP (Verzenden)
```env
SMTP_HOST=smtp.example.com           # SMTP server (bijv. smtp.gmail.com)
SMTP_PORT=465                        # Meestal 465 (TLS) of 587 (STARTTLS)
SMTP_SECURE=true                     # true voor 465, false voor 587
SMTP_USER=your-email@example.com     # Je e-mailadres
SMTP_PASS="your-password"            # App-wachtwoord (escape $ as \$)
SMTP_FROM=your-email@example.com     # Verzendadres (meestal = SMTP_USER)
SMTP_FROM_NAME=John Doe              # Je naam in "From:" header
SMTP_BCC=false                       # Optioneel: BCC alle berichten
```

### IMAP (Ontvangen)
```env
IMAP_HOST=imap.example.com           # IMAP server (defaults naar SMTP_HOST)
IMAP_PORT=993                        # Meestal 993 (TLS)
IMAP_SECURE=true                     # Meestal true
IMAP_USER=your-email@example.com     # Defaults naar SMTP_USER
IMAP_PASS="your-password"            # Defaults naar SMTP_PASS
```

### AI (OpenRouter)
```env
OPENROUTER_AI=sk-or-v1-your-key      # OpenRouter API key voor AI features
# Zonder key: AI buttons zijn grijs
```

### Google Calendar (Optioneel)
```env
GOOGLE_CLIENT_ID=...                 # OAuth client ID
GOOGLE_CLIENT_SECRET=...             # OAuth client secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
```

### Database & Auth
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/mail
AUTH_PASSWORD=your-secure-password   # Wachtwoord voor web login
AUTH_SECURE=false                    # true op productie (HTTPS)
```

## Projectstructuur

```
mail/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (SMTP, IMAP, AI, Google)
│   │   ├── mail/send             # SMTP verzenden
│   │   ├── mail/sync             # IMAP synchronisatie
│   │   ├── ai/                   # OpenRouter endpoints
│   │   └── google/               # Google OAuth callbacks
│   ├── auth/                     # Login pagina
│   └── page.tsx                  # Mail client UI
│
├── components/                   # React UI components
│   ├── MailApp.tsx              # Hoofd mail client (state, layout)
│   ├── ThreadList.tsx           # E-mail thread list
│   ├── ThreadView.tsx           # Thread detail viewer
│   ├── Composer.tsx             # Compose/reply UI
│   ├── FolderRail.tsx           # Folder navigation
│   └── ...                      # Dialogs, settings, etc
│
├── lib/                         # Business logic & utilities
│   ├── sync.ts                  # IMAP sync engine
│   ├── mail.ts                  # SMTP sending
│   ├── ai-sort.ts              # AI inbox sorting
│   ├── ai-mail.ts              # AI drafts/polish
│   ├── google-calendar.ts       # Google Calendar integration
│   ├── auth.ts                  # Password hashing & validation
│   ├── db.ts                    # PostgreSQL client
│   ├── types.ts                 # TypeScript type definitions
│   ├── schema.sql               # Database schema
│   └── ...                      # Folder management, parsing, etc
│
├── docker-compose.yml           # PostgreSQL + Redis (optional)
├── Dockerfile                   # Production container
├── DEPLOY.md                    # Deployment guide (Docker, VPS)
└── .env.example                # Environment template
```

## Database Schema

De app gebruikt PostgreSQL met deze kernentiteiten:

| Tabel | Doel |
|-------|------|
| `folders` | IMAP mappen (INBOX, Sent, Archive, etc) |
| `messages` | E-mailthreads (uid, date, from, subject, flags) |
| `bodies` | E-mailinhoud (html, text, attachments) |
| `email_config` | SMTP/IMAP instellingen (enkelvoudig record) |
| `google_tokens` | Google OAuth refresh tokens |
| `sessions` | Web login sessions |

Initialisatie: `npm run db:migrate`

## API Endpoints (Intern)

**Mail:**
- `POST /api/mail/send` - Verzend e-mail
- `POST /api/mail/sync` - Synchroniseer IMAP folder

**AI:**
- `POST /api/ai/draft` - Genereer concept
- `POST /api/ai/polish` - Verbeter tekst
- `POST /api/ai/tips` - Get communicatie tips
- `POST /api/ai/sort` - Categoriseer inbox

**Google Calendar:**
- `GET /api/google/auth-url` - Get OAuth flow start URL
- `GET /api/google/callback` - OAuth callback
- `POST /api/google/add-event` - Add event to calendar

## Deployment

Zie [DEPLOY.md](DEPLOY.md) voor:
- Docker Compose (lokaal met `docker compose up`)
- VPS deployment (Linux, Caddy/nginx, HTTPS)
- Database backups en restore
- Environment secrets op productie

## Troubleshooting

### "SMTP connection failed"
- Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env.local
- Run: `npm run test:smtp`
- Veel providers vereisen app-specific passwords (niet je login wachtwoord)

### "IMAP connection failed"
- Check IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS
- Run: `npm run test:imap`
- Voor Gmail: enable "Less secure app access" of use App Password

### "Database connection refused"
- Check DATABASE_URL in .env.local
- Is PostgreSQL draait? `docker compose up -d db`
- Maak database aan: `npm run db:migrate`

### AI buttons zijn grijs
- Geen OPENROUTER_AI key in .env.local
- Get key op [openrouter.ai](https://openrouter.ai)

### Google Calendar integratie niet werkend
- Zorg GOOGLE_CLIENT_ID/SECRET klopt
- GOOGLE_REDIRECT_URI moet exact matchen (bijv. `http://localhost:3000/api/google/callback`)
- Create OAuth credentials in [Google Cloud Console](https://console.cloud.google.com)

## TypeScript & Type Safety

- ✅ Strict mode enabled (`tsconfig.json`)
- ✅ No `any` types in custom code
- ✅ Type definitions in `lib/types.ts`
- ✅ API routes typed with Next.js Request/Response

Build command checks types: `npm run build`

## Security Notes

- 🔒 Passwords hashed with `crypto.timingSafeEqual` (timing-safe comparison)
- 🔒 Sessions use httpOnly, Secure, SameSite cookies
- 🔒 API routes validate input (email format, field presence)
- 🔒 Environment secrets never exposed to client
- ⚠️ Deploy with HTTPS on production (`AUTH_SECURE=true`)

## Git & Development

```bash
# Clone & setup
git clone <repo>
cd mail
npm install

# Create feature branch
git checkout -b feature/my-feature

# Make changes & test
npm run dev

# Lint & build
npm run build

# Commit & push
git add .
git commit -m "feat: describe your change"
git push origin feature/my-feature
```

## Performance

- 📊 DB connection pooling (max 10 connections)
- 📊 Message caching (avoid re-parsing)
- 📊 Lazy component loading (threading, AI)
- 📊 IMAP sync incremental (only new UIDs)

## Support & Contribution

- Bug reports: Create an issue
- Features: Discuss in issues first
- PRs: Follow existing code style (Prettier, ESLint)

## License

Proprietary. See LICENSE file.

---

**Last updated:** 2026-07-30  
**Maintainer:** John van der Pouw Kraan  
**Contact:** johnvdpk@gmail.com
