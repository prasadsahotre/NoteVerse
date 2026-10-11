DROP TABLE IF EXISTS "EmailVerificationOtp";

ALTER TABLE "User"
DROP COLUMN IF EXISTS "emailVerified";
