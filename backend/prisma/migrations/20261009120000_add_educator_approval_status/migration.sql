CREATE TYPE "EducatorApprovalStatus" AS ENUM (
  'NOT_APPLICABLE',
  'PENDING',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "User"
ADD COLUMN "educatorApprovalStatus" "EducatorApprovalStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';

UPDATE "User" AS "user"
SET "educatorApprovalStatus" = 'PENDING'
WHERE EXISTS (
  SELECT 1
  FROM "UserRole" AS "userRole"
  JOIN "Role" AS "role" ON "role"."id" = "userRole"."roleId"
  WHERE "userRole"."userId" = "user"."id"
    AND "role"."name" = 'EDUCATOR'
);
