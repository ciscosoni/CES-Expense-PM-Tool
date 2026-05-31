export type UserRole =
  | 'ADMIN'
  | 'FINANCE'
  | 'PROJECT_OWNER'
  | 'PROJECT_MANAGER'
  | 'APPROVER'
  | 'ENGINEER';

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  gradeId: string | null;
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
}

export interface TaskRow {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
  percentComplete: number;
  project?: { code: string } | null;
}

export interface ExpenseRow {
  id: string;
  category: string;
  amount: string;
  currency: string;
  incurredOn: string;
  status: 'DRAFT' | 'SUBMITTED' | 'OWNER_APPROVED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
  notes?: string | null;
}

export interface ReceiptAnalysis {
  ocr: { source: 'azure' | 'mock'; vendor?: string; amount?: string; currency?: string } | null;
  suggestion: {
    amount: string | null;
    currency: string | null;
    incurredOn: string | null;
    category: string | null;
    notes: string | null;
    tripId: string | null;
    projectId: string | null;
  };
}

export const isManager = (roles: UserRole[]): boolean =>
  roles.some((r) => ['PROJECT_MANAGER', 'PROJECT_OWNER', 'ADMIN', 'APPROVER', 'FINANCE'].includes(r));
