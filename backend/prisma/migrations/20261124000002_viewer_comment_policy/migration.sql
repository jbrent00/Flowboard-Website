ALTER TABLE "Project"
  ADD COLUMN "viewersCanComment" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ProjectTaskComment" (
  "id" SERIAL NOT NULL,
  "taskId" INTEGER NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectTaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectTaskComment_taskId_id_idx" ON "ProjectTaskComment"("taskId", "id");

ALTER TABLE "ProjectTaskComment" ADD CONSTRAINT "ProjectTaskComment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTaskComment" ADD CONSTRAINT "ProjectTaskComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
