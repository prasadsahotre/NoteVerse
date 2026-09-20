import express from 'express'
import healthRoutes from './routes/health.routes.js'
import courseRoutes from './routes/course.routes.js'
import userRoutes from './routes/user.routes.js'
import moduleRoutes from './routes/module.routes.js'
import lessonRoutes from './routes/lesson.routes.js'
import enrollmentRoutes from './routes/enrollment.routes.js'

const app = express()

app.use(express.json())

app.use('/api/v1/health', healthRoutes)
app.use('/api/v1/courses', courseRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/modules', moduleRoutes)
app.use('/api/v1/lessons', lessonRoutes)
app.use('/api/v1/enrollments', enrollmentRoutes)

export default app