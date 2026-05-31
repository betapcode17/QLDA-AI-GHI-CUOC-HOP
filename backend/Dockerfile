FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
RUN npm prune --omit=dev
COPY src ./src
EXPOSE 3001
CMD ["npm", "start"]
