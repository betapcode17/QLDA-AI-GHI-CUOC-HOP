FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=development \
    PORT=3001 \
    API_BASE_URL=http://localhost:3001 \
    FRONTEND_ORIGIN=http://localhost:5173 \
    DATABASE_URL=postgresql://postgres:17122005@host.docker.internal:5432/ai_meeting_assistant?schema=public \
    AI_SERVICE_URL=http://host.docker.internal:8000 \
    AUTH_DISABLED=true
RUN apk add --no-cache openssl ttf-dejavu
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node prisma/seed.js && npm start"]
