import multer from "multer";

const ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg"]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Only PDF, PNG, or JPEG deed documents are accepted."));
    }
  }
});
