import express from 'express'
import healthRoutes from './routes/health.routes.js'
import courseRoutes from './routes/course.routes.js'
import userRoutes from './routes/user.routes.js'
import moduleRoutes from './routes/module.routes.js'
import lessonRoutes from './routes/lesson.routes.js'
import enrollmentRoutes from './routes/enrollment.routes.js'
import progressRoutes from './routes/progress.routes.js'
import quizRoutes from './routes/quiz.routes.js'
import lessonQuestionRoutes from './routes/lessonQuestion.routes.js'
import courseReviewRoutes from './routes/courseReview.routes.js'

const app = express()

app.use(express.json())

app.use('/api/v1/health', healthRoutes)
app.use('/api/v1/courses', courseRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/modules', moduleRoutes)
app.use('/api/v1/lessons', lessonRoutes)
app.use('/api/v1/enrollments', enrollmentRoutes)
app.use('/api/v1/progress', progressRoutes)
app.use('/api/v1/quizzes', quizRoutes)
app.use('/api/v1/lesson-questions', lessonQuestionRoutes)
app.use('/api/v1/course-reviews', courseReviewRoutes)

export default app