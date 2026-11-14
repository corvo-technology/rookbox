-- CreateTable
CREATE TABLE "waitlist_entry" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedAt" TIMESTAMP(3),

    CONSTRAINT "waitlist_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entry_email_key" ON "waitlist_entry"("email");

-- CreateIndex
CREATE INDEX "waitlist_entry_status_createdAt_idx" ON "waitlist_entry"("status", "createdAt");
