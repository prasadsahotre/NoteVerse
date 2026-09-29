-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('PDF', 'AUDIO', 'VIDEO', 'IMAGE', 'LINK');

-- CreateTable
CREATE TABLE "LessonResource" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "url" TEXT NOT NULL,
    "lessonId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
