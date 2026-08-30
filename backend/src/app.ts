import express from 'express'
import healthRoutes from './routes/health.routes.js'
import courseRoutes from './routes/course.routes.js'
import userRoutes from './routes/user.routes.js'

const app = express()

app.use(express.json())

app.use('/api/v1/health', healthRoutes)
app.use('/api/v1/courses', courseRoutes)
app.use('/api/v1/users', userRoutes)

export default app