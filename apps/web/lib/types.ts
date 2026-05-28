/** Shared TS types mirroring API DTOs. Hand-maintained for now; OpenAPI codegen later. */

export type UserRole = 'ADMIN' | 'FINANCE' | 'PROJECT_MANAGER' | 'APPROVER' | 'ENGINEER';

export type CityTier = 'METRO' | 'TIER_2' | 'TIER_3' | 'INTERNATIONAL';

export type TravelClass =
  | 'FLIGHT_ECONOMY'
  | 'FLIGHT_BUSINESS'
  | 'TRAIN_3AC'
  | 'TRAIN_2AC'
  | 'TRAIN_1AC'
  | 'BUS_AC'
  | 'TAXI';

export type ClientKind = 'SI' | 'OEM';

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
  jobTitle?: string | null;
  roles: UserRole[];
  gradeId: string | null;
}

export interface Grade {
  id: string;
  code: string;
  name: string;
  seniorityOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface City {
  id: string;
  name: string;
  state?: string | null;
  country: string;
  tier: CityTier;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  kind: ClientKind;
  active: boolean;
}

export interface EndCustomer {
  id: string;
  name: string;
  industry?: string | null;
  active: boolean;
}

export interface CostRate {
  id: string;
  gradeId: string;
  ratePerDay: string;
  currency: string;
  effectiveFrom: string;
}

export interface EntitlementRow {
  id: string;
  gradeId: string;
  cityTier: CityTier;
  perDiemAmount: string;
  perDiemCurrency: string;
  lodgingCapPerNight: string;
  lodgingCurrency: string;
  travelClass: TravelClass;
  localConveyanceCapPerDay: string;
  localConveyanceCurrency: string;
  effectiveFrom: string;
}

export interface DaPolicy {
  id: string;
  name: string;
  partialDayPercent: string;
  intraCitySameDayPaysDa: boolean;
  effectiveFrom: string;
}

// ---- Projects, Tasks, Time, Allocations ----

export type ProjectCategory =
  | 'ACI'
  | 'NON_ACI'
  | 'SD_WAN'
  | 'SECURITY'
  | 'AUDIT'
  | 'MANAGED_SERVICES';
export type BillingModel = 'FIXED_PRICE' | 'T_AND_M' | 'MILESTONE';
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ON_HOLD' | 'CLOSED' | 'CANCELLED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';

export interface UserBrief {
  id: string;
  displayName: string;
  email: string;
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  whiteLabel: boolean;
  category: ProjectCategory;
  billingModel: BillingModel;
  contractValue: string;
  contractCurrency: string;
  plannedStart: string;
  plannedEnd: string;
  status: ProjectStatus;
  client: { id: string; name: string; kind: ClientKind };
  endCustomer: { id: string; name: string; industry?: string | null } | null;
  pm: UserBrief;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  value: string;
  currency: string;
  plannedDate: string;
  signedOffDate: string | null;
}

export interface ProjectSite {
  id: string;
  projectId: string;
  siteName: string;
  cityId: string;
  address?: string | null;
}

export interface ProjectDetail extends ProjectRow {
  milestones: Milestone[];
  sites: ProjectSite[];
}

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  description?: string | null;
  status: TaskStatus;
  percentComplete: number;
  assigneeId: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  assignee: UserBrief | null;
  project: { id: string; code: string; name: string };
}

export interface TaskDetail extends Task {
  timeLogs: TimeLog[];
}

export interface TimeLog {
  id: string;
  taskId: string;
  userId: string;
  date: string;
  hours: string;
  notes?: string | null;
  user?: UserBrief;
}

export interface Allocation {
  id: string;
  userId: string;
  projectId: string;
  percentAllocation: number;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
  user: UserBrief;
  project: { id: string; code: string; name: string; status: ProjectStatus };
}

export interface PnlBreakdown {
  effort: string;
  travel: string;
  lodging: string;
  da: string;
  localConveyance: string;
  otherExpenses: string;
  otherDirect: string;
  total: string;
}

export interface PnlResult {
  revenue: { amount: string; currency: string };
  cost: { amount: string; currency: string };
  costBreakdown: PnlBreakdown;
  grossProfit: { amount: string; currency: string };
  marginPercent: number | null;
}
