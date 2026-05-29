-- Phase 2C+2D+2E: Attendance, Change Requests, Comments, Anomalies
-- Hand-written to match the schema delta in one migration so a single
-- `prisma migrate dev` brings the DB to the new shape.

-- ============ ENUMS ============

-- 2C: Attendance
CREATE TYPE "AttendanceEventKind" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT', 'MANUAL_ENTRY');
CREATE TYPE "AttendanceEventSource" AS ENUM ('MOBILE', 'WEB', 'MANUAL', 'SYSTEM');
CREATE TYPE "AttendanceDayStatus" AS ENUM ('ABSENT', 'REMOTE', 'ON_SITE', 'PARTIAL', 'REGULARIZED');
CREATE TYPE "RegularizationReason" AS ENUM ('REMOTE_WORK', 'MISSED_PUNCH', 'SITE_VISIT_NOT_GEOFENCED', 'SICK', 'PERSONAL', 'OTHER');
CREATE TYPE "RegularizationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- 2D: Change requests
CREATE TYPE "ChangeRequestType" AS ENUM ('SCOPE', 'TIME', 'COST', 'MIXED');
CREATE TYPE "ChangeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- 2E: Anomalies
CREATE TYPE "AnomalyKind" AS ENUM ('RECEIPT_DUPLICATE', 'RECEIPT_AMOUNT_MISMATCH', 'RECEIPT_DATE_OUT_OF_TRIP', 'RECEIPT_GPS_FAR', 'ALLOCATION_OVERBOOK', 'PROJECT_OVER_BUDGET', 'PROJECT_MARGIN_RED', 'EXPENSE_OVER_CAP', 'ATTENDANCE_NO_PUNCH', 'ATTENDANCE_REGULARIZATION_STALE');
CREATE TYPE "AnomalySeverity" AS ENUM ('INFO', 'WARN', 'CRITICAL');

-- ============ ATTENDANCE TABLES (2C) ============

CREATE TABLE "AttendanceEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "AttendanceEventKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "accuracyMeters" INTEGER,
    "projectSiteId" UUID,
    "source" "AttendanceEventSource" NOT NULL DEFAULT 'MOBILE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AttendanceEvent_userId_occurredAt_idx" ON "AttendanceEvent"("userId", "occurredAt");
CREATE INDEX "AttendanceEvent_projectSiteId_occurredAt_idx" ON "AttendanceEvent"("projectSiteId", "occurredAt");

CREATE TABLE "AttendanceDay" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "firstEventAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "onSiteMinutes" INTEGER NOT NULL DEFAULT 0,
    "projectSiteIds" JSONB NOT NULL DEFAULT '[]',
    "status" "AttendanceDayStatus" NOT NULL DEFAULT 'ABSENT',
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "derivationNote" TEXT,
    "regularizationId" UUID,
    "recomputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttendanceDay_userId_date_key" ON "AttendanceDay"("userId", "date");
CREATE UNIQUE INDEX "AttendanceDay_regularizationId_key" ON "AttendanceDay"("regularizationId");
CREATE INDEX "AttendanceDay_date_status_idx" ON "AttendanceDay"("date", "status");

CREATE TABLE "AttendanceRegularization" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" "RegularizationReason" NOT NULL,
    "notes" TEXT NOT NULL,
    "projectId" UUID,
    "status" "RegularizationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approverId" UUID,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "AttendanceRegularization_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AttendanceRegularization_userId_date_idx" ON "AttendanceRegularization"("userId", "date");
CREATE INDEX "AttendanceRegularization_status_idx" ON "AttendanceRegularization"("status");

ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_projectSiteId_fkey" FOREIGN KEY ("projectSiteId") REFERENCES "ProjectSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceDay" ADD CONSTRAINT "AttendanceDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AttendanceDay" ADD CONSTRAINT "AttendanceDay_regularizationId_fkey" FOREIGN KEY ("regularizationId") REFERENCES "AttendanceRegularization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRegularization" ADD CONSTRAINT "AttendanceRegularization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AttendanceRegularization" ADD CONSTRAINT "AttendanceRegularization_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRegularization" ADD CONSTRAINT "AttendanceRegularization_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============ CHANGE REQUEST TABLES (2D) ============

CREATE TABLE "ProjectBaseline" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "contractValue" DECIMAL(18,4) NOT NULL,
    "contractCurrency" CHAR(3) NOT NULL,
    "budget" DECIMAL(18,4),
    "budgetCurrency" CHAR(3),
    "plannedStart" DATE NOT NULL,
    "plannedEnd" DATE NOT NULL,
    "scopeSummary" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "milestonesJson" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "ProjectBaseline_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectBaseline_projectId_key" ON "ProjectBaseline"("projectId");
ALTER TABLE "ProjectBaseline" ADD CONSTRAINT "ProjectBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ChangeRequestType" NOT NULL,
    "reason" TEXT NOT NULL,
    "contractValueDelta" DECIMAL(18,4),
    "budgetDelta" DECIMAL(18,4),
    "daysDelta" INTEGER,
    "scopeDelta" TEXT,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "approverId" UUID,
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "appliedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChangeRequest_projectId_code_key" ON "ChangeRequest"("projectId", "code");
CREATE INDEX "ChangeRequest_projectId_status_idx" ON "ChangeRequest"("projectId", "status");
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============ COMMENTS (2E) ============

CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "entityKind" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" UUID,
    "changeRequestId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Comment_entityKind_entityId_createdAt_idx" ON "Comment"("entityKind", "entityId", "createdAt");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ ANOMALIES (2E) ============

CREATE TABLE "AnomalyRule" (
    "id" UUID NOT NULL,
    "kind" "AnomalyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnomalyRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnomalyRule_kind_key" ON "AnomalyRule"("kind");

CREATE TABLE "Anomaly" (
    "id" UUID NOT NULL,
    "kind" "AnomalyKind" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "entityKind" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "detail" TEXT,
    "context" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "resolutionNote" TEXT,
    CONSTRAINT "Anomaly_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Anomaly_fingerprint_key" ON "Anomaly"("fingerprint");
CREATE INDEX "Anomaly_kind_severity_detectedAt_idx" ON "Anomaly"("kind", "severity", "detectedAt");
CREATE INDEX "Anomaly_entityKind_entityId_idx" ON "Anomaly"("entityKind", "entityId");
