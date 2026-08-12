# ConMan

Conference **operations** platform for staff, volunteers, department leads, and Con Managers.  
**Not** attendee registration, ticket sales, or public attendee management.

---

## Installation / Launch Instructions (Docker)

These steps bring up the full stack: PostgreSQL, NestJS API, and React web UI.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2+
- Git

### 1. Clone the repository

```bash
git clone https://github.com/sugitime/conman.git
cd conman
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and at minimum set a strong `JWT_SECRET`. Optional: change seed admin credentials, SMTP defaults, and ports.

### 3. Start the stack

```bash
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web UI | http://localhost:5173 |
| API | http://localhost:4000/api |
| Postgres | `localhost:5432` (user/password/db: `conman` by default) |

On first boot the API applies the Prisma schema and runs an **idempotent seed**.

### 4. Sign in (seed accounts)

| Role | Email | Password |
| --- | --- | --- |
| Con Manager | `admin@conman.local` | `changeme123` |
| Department Lead | `lead@conman.local` | `changeme123` |
| Volunteer | `volunteer@conman.local` | `changeme123` |

Change these immediately for any real deployment (`SEED_ADMIN_*` in `.env`).

### 5. Stop the stack

```bash
docker compose down
```

### 6. View logs

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db
```

### 7. Reset the database

**Destructive** — deletes Postgres data and re-seeds on next start:

```bash
docker compose down -v
docker compose up --build
```

### Optional Redis

```bash
docker compose --profile redis up -d redis
```

Set `REDIS_URL=redis://redis:6379` when you add queue/cache consumers (schema is ready; Redis is optional).

### Local development (without full Docker app images)

```bash
docker compose up -d db
cd backend
# Use localhost DATABASE_URL:
# DATABASE_URL=postgresql://conman:conman@localhost:5432/conman?schema=public
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run start:dev

cd ../frontend
npm install
npm run dev
```

---

## Application architecture overview

### Tech stack

| Layer | Technology |
| --- | --- |
| API | Node.js, NestJS, TypeScript, Prisma ORM |
| Web | React 19, TypeScript, Vite, Tailwind CSS |
| Database | PostgreSQL 16 |
| Auth | JWT (Bearer), Passport |
| Email | Nodemailer (SMTP from admin settings) |
| Files | Local volume (`/app/uploads`) + external URL links |
| Containers | Docker Compose: `api`, `web` (nginx), `db`, optional `redis` |

### Folder structure

```
conman/
  docker-compose.yml
  .env.example
  README.md
  backend/
    Dockerfile
    prisma/schema.prisma   # data model
    prisma/seed.ts
    src/
      auth/                # login, invites, JWT
      users/               # user admin + invite
      policies/            # reusable access policies
      settings/            # SMTP, hotel limits, global feature toggles
      departments/         # depts, members, per-dept features
      inventory/           # assets, QR codes, checkout/checkin
      profiles/            # volunteer profiles, hotel compliance
      audit/               # audit log helper
      ops/                 # helpdesk, calendar, todos, comms, surveys, …
      mail/
      common/              # permissions, guards, decorators
  frontend/
    Dockerfile + nginx.conf
    src/
      pages/               # feature screens
      components/          # layout + UI primitives
      lib/api.ts, auth.tsx
```

### Major components & data flow

1. Browser loads SPA from `web` (nginx). API calls go to `/api/*` (proxied to Nest in Docker).
2. User authenticates → JWT stored in `localStorage`.
3. Every authenticated request includes `Authorization: Bearer <token>`.
4. Guards enforce: authentication → roles → permissions → **global feature toggles**.
5. Con Managers bypass feature denial on API (so they can re-enable features); UI still respects toggles for navigation for all roles via settings payload.
6. Domain modules read/write PostgreSQL through Prisma.
7. Uploads land on a Docker volume; external docs store public Drive/OneDrive/Dropbox URLs with revision history.

### Auth model

- **JWT** signed with `JWT_SECRET`, expiry `JWT_EXPIRES_IN`.
- **System roles**: `CON_MANAGER`, `DEPARTMENT_LEAD`, `VOLUNTEER`, `GUEST`.
- **Baseline permissions** per role in `backend/src/common/permissions.ts`.
- **Access policies**: named sets of permission keys assignable to many users (additive).
- **Invites**: Department Leads / Con Managers invite by email; tokenized link → account creation.

### Department & role model

- Users belong to zero or more departments (`DepartmentMember`, optional `isLead`).
- Department flags:
  - `isOrderingDept` — can fulfill item orders
  - `helpdeskQueueAccess` — appears in ticket routing dropdown
- **Per-department feature JSON** toggles helpdesk, calendar, todos, communications, documents, surveys, handover notes, shifts, inventory, run-of-show, budget, item orders.

### Feature toggle system

- **Global** map on `AppSettings.globalFeatures` (Con Manager Settings UI).
- **Department** map on `Department.features`.
- Disabled **global** features: hidden from nav; API returns 403 for non–Con Managers (`FeatureGuard` + `@RequireFeature`).
- Catalog keys include: org chart, badges, shifts, communications, inventory, radio, on-call, rooms, budget, lost & found, media, con bible, helpdesk, calendar, todos, documents, surveys, handovers, orders, run of show, vendors, meals, kiosk, staff lists, audit log, schedule publishing.

### Calendar system

- Personal/department events + **master calendar** events (`isMaster`) always overlaid for everyone.
- Overlay requests between users (approve/deny).
- **iCal export** (`GET /api/calendar/export.ics`) for Google Calendar / Apple Calendar.
- Shift signup checks conflicts against calendar events.

### Helpdesk

- Severity: Low / Medium / High / Critical.
- Status workflow + comments.
- Master queue for Con Manager.
- **Incident flag** (`isIncident`) for simple incident reporting that uses the same queue.

### Document storage + revisioning

- Sources: `LOCAL` upload or `EXTERNAL` URL.
- Each change creates a `DocumentRevision` (version++, notes, actor).
- Current pointer fields on `Document` for list performance.

### Survey system

- Form builder stores questions as JSON (text, textarea, single, multi, scale, date).
- Responses stored as JSON answers; export as **CSV spreadsheet** or **plain text**.
- Template flag + `templateKey` (seed includes after-action feedback).

### Hotel compliance logic

- Profile: check-in, check-out, optional roommate (same department).
- Roommate link is **bidirectional**; hotel dates **sync** both ways.
- Night count vs `hotelSoloNightLimit` / `hotelRoommateNightLimit` on `AppSettings`.
- Out of compliance → flags on user, in-app notifications, email to volunteer and department leads (if SMTP configured).

### Badge system

- Badge types (Staff, Volunteer, Guest, Press, Vendor, …).
- Assignments carry printable `badgeCode` (QR payload).
- Print payload API: name, departments, role, pronouns, access levels.

### Shift scheduling

- Shifts with slots, self-signup and lead assignment.
- Conflict detection: overlapping shifts and calendar events.

### Inventory / QR tracking

- Assets: name, description, serial, category, status (`AVAILABLE` | `CHECKED_OUT` | `MAINTENANCE` | `LOST`), location, department, unique `assetCode`.
- QR images generated from `assetCode` (printable in UI).
- Check-out / check-in by code (bulk supported); records actor, timestamps, expected return, notes.
- Dashboard of checked-out items; event audit history; receive fulfilled orders into inventory.
- Optional low-stock / lost alerts endpoint.

### Radio channels & on-call

- Channels + people assignments / call signs.
- On-call slots with time range and contact methods; “who is on call” via current time queries.

### Org chart

- Hierarchical `OrgChartNode` (parent/child), titles, optional user + department.
- Con Manager writes; all staff can read when feature enabled.

### Other modules

- Rooms with **booking conflict detection**
- Budget line items + **approve/reject workflow**
- Vendors/exhibitors (lightweight)
- Meals + dietary selections
- Lost & found
- Media gallery with tags
- Con Bible quick reference
- Staff directory / printable lists (privacy-controlled fields)
- Kiosk staff check-in/out (email or badge code)
- Comprehensive `AuditLog`

---

## Role descriptions and permission model

| Role | Intent |
| --- | --- |
| **Con Manager** | Full system admin: settings, users, policies, all features, master helpdesk, master calendar, org chart, global toggles |
| **Department Lead** | Manage own department(s), invite volunteers/guests, todos/comms for team, helpdesk, docs, surveys, shifts, inventory, orders, budget submit, handovers |
| **Volunteer** | Profile, assigned work, helpdesk create, documents, inventory check-out/in, shift signup |
| **Guest** | Limited creator/access accounts (documents baseline; extend via policies) |

Permissions are string keys (e.g. `inventory.manage`, `helpdesk.master`). Policies **add** permissions on top of role defaults. Con Manager effectively has all keys.

---

## Key features summary

- Flexible multi-department convention ops (any event type)
- JWT + RBAC + reusable access policies
- Global + per-department feature toggles
- Helpdesk + incidents, master queue
- Calendar with master overlay + iCal export
- Todos & priority communications (ack receipts; SMS channel reserved)
- Documents with revision history (upload + cloud links)
- Surveys with CSV/text export + after-action template
- Handover notes for shift transitions
- Shifts with signup and conflict detection
- Full inventory/asset tracking with QR check-out/in
- Item orders → inventory receiving
- Budget approval workflow
- Org chart, badges, radio, on-call, rooms, vendors, meals
- Volunteer profiles, hotel/roommate compliance
- Kiosk check-in, staff lists, audit log, Con Bible, media, lost & found, run-of-show
- Docker one-command launch + seed data

---

## Configuration reference (environment variables)

| Variable | Description | Default |
| --- | --- | --- |
| `NODE_ENV` | runtime mode | `production` in containers |
| `POSTGRES_USER` / `PASSWORD` / `DB` | database credentials | `conman` |
| `DATABASE_URL` | Prisma connection string | compose service URL |
| `JWT_SECRET` | **required** strong secret | change me |
| `JWT_EXPIRES_IN` | token lifetime | `7d` |
| `CORS_ORIGIN` | allowed web origin(s), comma-separated | `http://localhost:5173` |
| `APP_URL` | public web URL (invite links) | `http://localhost:5173` |
| `UPLOAD_DIR` | local upload path | `/app/uploads` |
| `MAX_UPLOAD_MB` | upload size limit | `25` |
| `SEED_ADMIN_EMAIL` | bootstrap Con Manager | `admin@conman.local` |
| `SEED_ADMIN_PASSWORD` | bootstrap password | `changeme123` |
| `SEED_ADMIN_NAME` | bootstrap display name | `Con Manager` |
| `REDIS_URL` | optional Redis | empty |
| `VITE_API_URL` | frontend build-time API base (empty = same origin `/api`) | empty |
| `SMTP_*` | optional defaults; runtime SMTP usually set in Admin → Settings | empty |

Never commit real secrets. `.env` is gitignored.

---

## Development notes and how to extend

### Adding a permission

1. Add key to `PERMISSIONS` in `backend/src/common/permissions.ts`.
2. Attach to role defaults or policies.
3. Guard routes with `@RequirePermissions('your.key')`.

### Adding a toggleable feature

1. Add key to `GLOBAL_FEATURES` (and `DEPARTMENT_FEATURES` if dept-scoped).
2. Annotate controllers with `@RequireFeature('your_key')`.
3. Gate nav items in `frontend/src/components/Layout.tsx` with `feature: 'your_key'`.

### Adding a domain module

1. Extend `prisma/schema.prisma`, run `npx prisma db push` (or migrate).
2. Create Nest module under `backend/src/`.
3. Register in `app.module.ts`.
4. Add React page + route in `App.tsx` and Layout nav.

### SMS gateway (future)

`Communication.channels` includes `SMS`; `smsProviderId` / `smsPayload` are reserved. Wire a provider in a mail/SMS service without changing the targeting model (roles, departments, recipient IDs).

### Tests & quality

- Prefer API integration tests against dockerized Postgres.
- Keep feature flags default-on in seed so demos work; production can disable unused modules.

### Production checklist

- Strong `JWT_SECRET` and admin passwords  
- TLS termination (reverse proxy)  
- Back up Postgres volume  
- Configure SMTP for invites/compliance mail  
- Restrict CORS and public kiosk exposure as needed  

---

## License

Private / internal use unless otherwise stated by the repository owner.
