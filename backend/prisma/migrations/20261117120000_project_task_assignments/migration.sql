CREATE TABLE "ProjectTaskAssignment" (
    "projectId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ProjectTaskAssignment_pkey" PRIMARY KEY ("taskId", "userId")
);

CREATE INDEX "ProjectTaskAssignment_projectId_userId_idx"
    ON "ProjectTaskAssignment"("projectId", "userId");
CREATE UNIQUE INDEX "ProjectTask_projectId_id_key"
    ON "ProjectTask"("projectId", "id");

ALTER TABLE "ProjectTaskAssignment" ADD CONSTRAINT "ProjectTaskAssignment_projectId_taskId_fkey"
    FOREIGN KEY ("projectId", "taskId") REFERENCES "ProjectTask"("projectId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTaskAssignment" ADD CONSTRAINT "ProjectTaskAssignment_projectId_userId_fkey"
    FOREIGN KEY ("projectId", "userId") REFERENCES "ProjectMembership"("projectId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
