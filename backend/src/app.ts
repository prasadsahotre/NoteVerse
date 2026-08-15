import express from 'express'
import healthRoutes from './routes/health.routes.js'

const app = express()

app.use(express.json())

app.use('/api/v1/health', healthRoutes)

export default app