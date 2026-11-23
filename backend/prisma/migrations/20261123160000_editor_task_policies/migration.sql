ALTER TABLE "Project"
  ADD COLUMN "editorsCanCreateTasks" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "editorsCanEditAllTasks" BOOLEAN NOT NULL DEFAULT true;
