# ConMan

Production-oriented **conference operations** platform for staff, volunteers, and departments.

**Not** an attendee registration system.

## Stack

| Layer | Tech |
| --- | --- |
| API | NestJS + TypeScript + Prisma |
| Web | React + TypeScript + Vite + Tailwind |
| DB | PostgreSQL 16 |
| Auth | JWT + system roles + reusable Access Policies |
| Deploy | Docker Compose (`api`, `web`, `db`; optional `redis` profile) |

## Features

- **Roles**: Con Manager, Department Lead, Volunteer, Guest
- **Access policies**: reusable permission sets assigned to users
- **Global feature toggles**: hide/disable Org Chart, Badges, Shifts, Comms, Inventory, Radio, On-Call, Rooms, Budget, Lost & Found, Media, Con Bible, Helpdesk, Calendar, Todos, Documents, Surveys, Orders, Run of Show, etc.
- **Departments**: ordering flag, helpdesk queue access, per-department feature toggles
- **Helpdesk**: severity levels, master queue for Con Manager
- **Calendar**: master calendar overlay for everyone; overlay requests between users
- **Todos & communications**: targeted department/staff messaging
- **Documents**: local upload + external links (Drive/OneDrive/Dropbox) with revision history
- **SMTP settings** in admin UI for invites/notifications
- Plus: surveys, handover notes API, shifts, inventory, item orders, budget, org chart, badges, radio, on-call, rooms, lost & found, media, con bible, run of show

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:5173  
- API: http://localhost:4000/api  

### Seed accounts

| Role | Email | Password |
| --- | --- | --- |
| Con Manager | `admin@conman.local` | `changeme123` |
| Department Lead | `lead@conman.local` | `changeme123` |
| Volunteer | `volunteer@conman.local` | `changeme123` |

Override seed admin via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`.

## Local development (without Docker web/api)

```bash
# DB only
docker compose up -d db

# API
cd backend
cp ../.env.example ../.env   # or export DATABASE_URL for localhost
# DATABASE_URL=postgresql://conman:conman@localhost:5432/conman
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run start:dev

# Web
cd frontend
npm install
npm run dev
```

## Optional Redis

```bash
docker compose --profile redis up -d redis
```

Set `REDIS_URL=redis://redis:6379` when you wire queue/cache consumers.

## Project layout

```
backend/          NestJS API + Prisma schema + seed
frontend/         React SPA
docker-compose.yml
uploads/          (volume) local document/media files
```

## Security notes

- Change `JWT_SECRET` and seed passwords before any real deployment.
- Never commit `.env` or Render/API keys.
- Feature-disabled modules return `403` for non–Con Manager API access and are hidden in the nav.
