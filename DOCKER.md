# Docker Compose

Docker is configured to run only the frontend and backend.

PostgreSQL and the AI server run directly on the host machine:

- PostgreSQL: `localhost:5432`
- AI server: `http://localhost:8000`
- Backend API: `http://localhost:3001`
- Backend Swagger: `http://localhost:3001/docs`
- Frontend: `http://localhost:5173`

Run from the repository root:

```powershell
copy .env.docker.example .env.docker
docker compose --env-file .env.docker up --build
```

For development hot reload:

```powershell
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.dev.yml up --build
```

The backend container uses `host.docker.internal` to reach host services:

```env
DOCKER_DATABASE_URL=postgresql://postgres:17122005@host.docker.internal:5432/ai_meeting_assistant?schema=public
DOCKER_AI_SERVICE_URL=http://host.docker.internal:8000
```

Before starting Docker, make sure these host services are running:

```powershell
python run.py
```

Also make sure PostgreSQL is running and the database exists:

```powershell
cd backend
npx prisma migrate dev
npm run prisma:seed
```
