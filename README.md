# Learnix AI

Learnix AI is a React/Vite + Flask/MySQL educational platform prototype. This version keeps the existing chatbot, PDF upload, quiz generation, correction, history, dashboards and messaging, while adding the first structured platform layer for Moroccan schools, directors, classes, modules, schedules, role protection and adaptive-learning profiles.

## Architecture

- `backend/app.py` keeps the legacy compatible routes.
- `backend/learnix/config.py` centralizes environment configuration.
- `backend/learnix/database.py` centralizes MySQL access and compatibility helpers.
- `backend/learnix/security.py` provides signed JWT-compatible bearer tokens, role guards and reset-password tokens.
- `backend/learnix/groq_client.py` centralizes Groq calls and rotates configured keys on quota or authentication errors.
- `backend/learnix/schools.py` adds school approval, Moroccan levels, classes and modules.
- `backend/learnix/schedule.py` adds availability and generated schedules.
- `backend/learnix/ai.py` prepares adaptive learning profiles from quiz history.
- `backend/migrations/` contains ordered, repeatable SQL migrations.
- `backend/seeders/` contains idempotent reference and development data seeders.
- `frontend/src/services/api.js` centralizes API calls through `VITE_API_URL`.

## Quick Start With Git Bash

From the project root:

```bash
bash scripts/setup-git-bash.sh
bash scripts/run-all-git-bash.sh
```

Open:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:5000`

If you prefer two terminals:

```bash
bash scripts/run-backend.sh
```

```bash
bash scripts/run-frontend.sh
```

The scripts reuse your existing `backend/.env`. They do not print or commit your Groq key.

## Manual Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set real local values. Never commit `.env` or API keys.

For automatic Groq quota failover, configure all keys on one comma-separated line:

```env
GROQ_API_KEYS=gsk_first_key,gsk_second_key,gsk_third_key
GROQ_MODEL=llama-3.3-70b-versatile
```

The legacy `GROQ_API_KEY` variable remains supported as a fallback. A request starts
with the last successful key and switches keys only when Groq reports a rate limit,
an invalid key, or a permission error.

```powershell
flask --app app run --debug
```

## MySQL Setup

Create the database, apply every pending migration, and seed development data:

```powershell
cd backend
.\.venv\Scripts\python.exe manage_db.py setup
```

Useful database commands:

```powershell
.\.venv\Scripts\python.exe manage_db.py migrate
.\.venv\Scripts\python.exe manage_db.py seed
.\.venv\Scripts\python.exe manage_db.py status
```

The default development accounts use the password from `SEED_DEFAULT_PASSWORD`
(`Learnix123!` when unset). The seeders can be rerun without duplicating data.

## Frontend Setup

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Set the API URL in `frontend/.env`:

```env
VITE_API_URL=http://127.0.0.1:5000
```

## Roles

Supported roles are:

- `general_admin`
- `school_director`
- `teacher`
- `student`
- `guest_teacher`
- `guest_student`

Legacy `Teacher` and `Student` values are normalized for compatibility.

## Password Reset

`POST /forgot-password` now creates a temporary reset token instead of changing the password directly. Use `POST /reset-password` with `email`, `token` and `password`. In development, the token is returned in the JSON response so the flow can be tested before email delivery is added.
