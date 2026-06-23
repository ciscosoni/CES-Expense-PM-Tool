-- P10 #4: confident auto-approval kill switch (default OFF; suggest-only stays default).
ALTER TABLE "AutoApprovalPolicy" ADD COLUMN "autoApprove" BOOLEAN NOT NULL DEFAULT false;
