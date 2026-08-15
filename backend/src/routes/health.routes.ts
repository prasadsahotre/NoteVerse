import { Router } from 'express'

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'NoteVerse API is running',
  })
})

export default router