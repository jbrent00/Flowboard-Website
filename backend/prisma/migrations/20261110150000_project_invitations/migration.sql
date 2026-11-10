CREATE TYPE "InvitationRole" AS ENUM ('editor', 'viewer');
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'revoked', 'expired');

CREATE TABLE "UserEmail" (
    "userId" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("userId","normalizedEmail")
);

CREATE TABLE "ProjectInvitation" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "inviterId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "role" "InvitationRole" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInvitation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserEmail_normalizedEmail_idx" ON "UserEmail"("normalizedEmail");
CREATE INDEX "ProjectInvitation_normalizedEmail_status_expiresAt_idx"
    ON "ProjectInvitation"("normalizedEmail","status","expiresAt");
CREATE INDEX "ProjectInvitation_projectId_status_expiresAt_idx"
    ON "ProjectInvitation"("projectId","status","expiresAt");

-- Keep resolved invitations while preventing two pending invitations for the same address.
CREATE UNIQUE INDEX "ProjectInvitation_one_pending_per_project_email"
    ON "ProjectInvitation"("projectId","normalizedEmail") WHERE "status" = 'pending';

ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectInvitation" ADD CONSTRAINT "ProjectInvitation_inviterId_fkey"
    FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
