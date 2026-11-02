-- CreateEnum
CREATE TYPE "IssueEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNEE_CHANGED');

-- CreateTable
CREATE TABLE "IssueEvent" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "IssueEventType" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueEvent_tenantId_issueId_seq_idx" ON "IssueEvent"("tenantId", "issueId", "seq");

-- CreateIndex
CREATE INDEX "IssueEvent_actorId_idx" ON "IssueEvent"("actorId");

-- AddForeignKey
ALTER TABLE "IssueEvent" ADD CONSTRAINT "IssueEvent_tenantId_issueId_fkey" FOREIGN KEY ("tenantId", "issueId") REFERENCES "Issue"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueEvent" ADD CONSTRAINT "IssueEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
