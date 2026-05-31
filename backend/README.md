# AI Meeting Assistant Backend

Node.js 22 Express backend using PostgreSQL, Prisma, JWT auth, RBAC, Swagger, Multer uploads, Winston logging, Helmet, CORS, and rate limiting.

## Architecture

```text
src/
  config/        env and Prisma
  controllers/   HTTP handlers
  dtos/          Zod request validation
  middleware/    auth, validation, uploads, errors
  repositories/  database access
  routes/        REST route modules
  services/      business logic and AI bridge
  docs/          Swagger/OpenAPI
```

The Node backend owns business data in PostgreSQL. Existing Python FastAPI AI endpoints remain the inference service and are called through `AI_SERVICE_URL`.

## Run locally

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

Swagger: `http://localhost:3001/docs`

Default seeded admin:

```text
admin@example.com / Admin@123456
```

## Frontend connection

Set `frontend/.env`:

```text
VITE_API_BASE_URL=http://localhost:3001
```

The Node backend proxies these existing AI endpoints to FastAPI:

- `GET /health`
- `GET /models/status`
- `POST /api/transcribe`
- `POST /api/transcribe-with-speakers`
- `POST /api/process`
- `POST /api/translate`
- `POST /debug/llm-test`

Additional workflow APIs:

- `POST /meetings/:meetingId/process-audio` uploads audio, calls FastAPI `/api/process`, then persists file metadata, speakers, transcripts, summary, and action items.
- `POST /meetings/:meetingId/transcripts/import` imports `.txt`, `.json`, `.srt`, or `.vtt` transcript files into transcript segments.
- `GET /search?q=...` searches meetings, transcripts, summaries, and action items.
- `GET /meetings/:meetingId/export/json`
- `GET /meetings/:meetingId/export/docx`
- `GET /meetings/:meetingId/export/pdf`

Keep the Python service running at `AI_SERVICE_URL`, default `http://localhost:8000`.

## Example requests

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"login\":\"admin@example.com\",\"password\":\"Admin@123456\"}"
```

```bash
curl -X POST http://localhost:3001/meetings \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Sprint planning\",\"status\":\"Scheduled\"}"
```

```bash
curl -X POST "http://localhost:3001/api/process?language=vi&include_diarization=true" \
  -F "file=@meeting.wav"
```

## Security and performance

- Store strong JWT secrets in `.env`; never commit real secrets.
- Use HTTPS and secure cookies at deployment boundary.
- Passwords are hashed with bcrypt.
- RBAC protects admin and manager endpoints.
- Cursor pagination is supported through `cursor` and `limit`.
- Soft delete is implemented with `deleted_at` on mutable business tables.
- PostgreSQL indexes are added for status filters, timestamps, foreign keys, labels, and dashboard queries.
- Large files are stored on disk through Multer; production should move `file_path` to object storage.
