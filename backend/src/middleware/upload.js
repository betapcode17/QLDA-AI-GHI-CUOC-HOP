import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { env } from '../config/env.js';

fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${uuid()}${path.extname(file.originalname)}`)
});

export const upload = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 }
});
