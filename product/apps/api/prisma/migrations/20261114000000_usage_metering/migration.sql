-- CreateTable
CREATE TABLE "usage_event" (
    "id" SERIAL NOT NULL,
    "reporterId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT,
    "ownerTag" TEXT,
    "template" TEXT NOT NULL,
    "vcpu" INTEGER NOT NULL,
    "memoryMib" INTEGER NOT NULL,
    "diskMib" INTEGER NOT NULL,
    "machineStartedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'reporter',

    CONSTRAINT "usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_interval" (
    "id" SERIAL NOT NULL,
    "machineId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "template" TEXT NOT NULL,
    "vcpu" INTEGER NOT NULL,
    "memoryMib" INTEGER NOT NULL,
    "diskMib" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "seconds" INTEGER,

    CONSTRAINT "usage_interval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_reporter" (
    "id" TEXT NOT NULL,
    "lastContactAt" TIMESTAMP(3) NOT NULL,
    "lastEventAt" TIMESTAMP(3),
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "pollIntervalS" INTEGER NOT NULL DEFAULT 30,

    CONSTRAINT "usage_reporter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_event_idempotencyKey_key" ON "usage_event"("idempotencyKey");

-- CreateIndex
CREATE INDEX "usage_event_machineId_observedAt_idx" ON "usage_event"("machineId", "observedAt");

-- CreateIndex
CREATE INDEX "usage_event_reporterId_machineId_idx" ON "usage_event"("reporterId", "machineId");

-- CreateIndex
CREATE INDEX "usage_interval_machineId_idx" ON "usage_interval"("machineId");

-- CreateIndex
CREATE INDEX "usage_interval_ownerUserId_startedAt_idx" ON "usage_interval"("ownerUserId", "startedAt");

-- CreateIndex
CREATE INDEX "usage_interval_endedAt_idx" ON "usage_interval"("endedAt");
