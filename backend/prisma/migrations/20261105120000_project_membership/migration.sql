CREATE TYPE "ProjectRole" AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectMembership" (
    "projectId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMembership_pkey" PRIMARY KEY ("projectId","userId")
);

CREATE INDEX "ProjectMembership_userId_role_idx" ON "ProjectMembership"("userId","role");

ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
