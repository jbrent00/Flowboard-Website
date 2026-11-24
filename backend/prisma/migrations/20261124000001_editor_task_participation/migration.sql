ALTER TABLE "Project"
  ADD COLUMN "editorsCanJoinTasks" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "editorsCanLeaveTasks" BOOLEAN NOT NULL DEFAULT true;
