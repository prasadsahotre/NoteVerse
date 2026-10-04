import multer from 'multer'

const allowedMimeTypes = new Set([
  'application/pdf',

  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',

  'video/mp4',
  'video/webm',
  'video/quicktime',

  'image/jpeg',
  'image/png',
  'image/webp',
])

const storage = multer.memoryStorage()

const multerUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        new Error(`Unsupported file type: ${file.mimetype}`),
      )
    }

    callback(null, true)
  },
})

export default multerUpload