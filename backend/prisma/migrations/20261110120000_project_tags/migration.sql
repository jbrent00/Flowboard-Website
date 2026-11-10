CREATE TABLE "ProjectTag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,

    CONSTRAINT "ProjectTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectTaskTag" (
    "taskId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "ProjectTaskTag_pkey" PRIMARY KEY ("taskId","tagId")
);

CREATE UNIQUE INDEX "ProjectTag_projectId_normalizedName_key" ON "ProjectTag"("projectId","normalizedName");
CREATE INDEX "ProjectTaskTag_tagId_idx" ON "ProjectTaskTag"("tagId");

ALTER TABLE "ProjectTag" ADD CONSTRAINT "ProjectTag_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTaskTag" ADD CONSTRAINT "ProjectTaskTag_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectTaskTag" ADD CONSTRAINT "ProjectTaskTag_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "ProjectTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
