import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import multer from 'multer';

import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] ?? '';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

export class UnsupportedLogoTypeError extends Error {}

const logoUpload = multer({
  storage,
  limits: { fileSize: config.maxLogoSizeBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new UnsupportedLogoTypeError('지원하지 않는 이미지 형식입니다 (PNG/JPEG/WEBP/GIF만 가능)'));
      return;
    }
    cb(null, true);
  },
});

// 로고가 잘못된 형식/용량이어도 이벤트 생성 자체는 막지 않고 400 으로 명확히 알려준다.
export function uploadLogo(req, res, next) {
  logoUpload.single('logo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof UnsupportedLogoTypeError) {
      return res.status(400).json({ ok: false, error: 'UNSUPPORTED_LOGO_TYPE', message: err.message });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ ok: false, error: 'LOGO_TOO_LARGE' });
    }
    next(err);
  });
}
