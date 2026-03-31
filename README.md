# SE Pipeline Tracker

A browser-based tool for SE Managers and their teams to track tasks, next steps, and activity against Salesforce opportunities.

---

## Prerequisites (one-time setup)

Before running this project you need:

1. **WSL2** with Ubuntu 22.04 installed
2. **Docker Desktop for Windows** with the WSL2 backend enabled and Ubuntu-22.04 integration turned on
3. **Node.js v20+** inside WSL2 (via nvm)
4. **Git** and **GitHub CLI** inside WSL2

---

## First-time setup

All commands below are run inside the **Ubuntu (WSL2) terminal**, not PowerShell.

### 1. Copy the environment file

```bash
cp .env.example .env
```

Open `.env` and set a strong value for `JWT_SECRET` and your `ANTHROPIC_API_KEY`. You can generate a secret with:

```bash
openssl rand -hex 32
```

Leave the Postgres values as-is for local development.

### 2. Start the database

Docker Compose starts a PostgreSQL container in the background. The `-d` flag means "detached" — it runs silently and frees your terminal.

```bash
docker compose up -d
```

### 3. Verify the database is running

This lists all running containers. You should see a `db` container with status `healthy`.

```bash
docker ps
```

### 4. Connect to the database (optional sanity check)

This opens a psql shell directly inside the container. Type `\q` to exit.

```bash
docker exec -it $(docker compose ps -q db) psql -U pipeline_user -d se_pipeline
```

### 5. Run database migrations

This creates all the tables. Run it once after the container is healthy.

```bash
cd server && npm run migrate
```

### 6. Seed sample data

Creates 1 manager user, 2 SE users, and 5 sample opportunities so you have something to look at.

```bash
npm run seed
```

### 7. Start the backend server

```bash
npm run dev
```

The server starts on `http://localhost:3001`. Verify it's working:

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","timestamp":"..."}
```

### 8. Start the frontend (new terminal tab)

```bash
cd ../client && npm run dev
```

The app opens at `http://localhost:5173`.

---

## Daily workflow

```bash
# Start DB (if not already running)
docker compose up -d

# Start backend
cd server && npm run dev

# Start frontend (separate terminal)
cd client && npm run dev
```

---

## Stopping everything

```bash
# Stop the database container (data is preserved in the Docker volume)
docker compose down

# To completely wipe the database and start fresh:
docker compose down -v
```

---

## Project structure

```
se-pipeline-tracker/
├── client/          # React + TypeScript + Vite frontend
├── server/          # Node.js + Express + TypeScript backend
│   ├── src/
│   │   ├── routes/       # Express route handlers
│   │   ├── middleware/   # Auth, error handling
│   │   ├── services/     # Business logic
│   │   ├── db/           # PostgreSQL client + queries
│   │   └── types/        # Shared TypeScript types
│   ├── migrations/       # SQL migration files (numbered)
│   └── scripts/          # seed.ts, migrate.ts
├── docker-compose.yml
├── .env.example     # Committed — placeholder values only
└── .env             # NOT committed — your real values
```

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 (via Docker) |
| Auth | JWT + bcrypt |
| AI | Anthropic Claude API |
