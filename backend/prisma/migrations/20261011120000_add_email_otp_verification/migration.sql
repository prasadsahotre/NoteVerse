ALTER TABLE "User"
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- Preserve access for every account that existed before email verification.
UPDATE "User" SET "emailVerified" = true;

CREATE TABLE "EmailVerificationOtp" (
    "userId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationOtp_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "EmailVerificationOtp_expiresAt_idx" ON "EmailVerificationOtp"("expiresAt");

ALTER TABLE "EmailVerificationOtp"
ADD CONSTRAINT "EmailVerificationOtp_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
