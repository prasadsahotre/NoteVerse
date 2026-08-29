import express from 'express'
import healthRoutes from './routes/health.routes.js'
import courseRoutes from './routes/course.routes.js'

const app = express()

app.use(express.json())

app.use('/api/v1/health', healthRoutes)
app.use('/api/v1/courses', courseRoutes)

export default app