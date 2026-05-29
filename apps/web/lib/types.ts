/** Shared TS types mirroring API DTOs. Hand-maintained for now; OpenAPI codegen later. */

export type UserRole =
  | 'ADMIN'
  | 'FINANCE'
  | 'PROJECT_OWNER'
  | 'PROJECT_MANAGER'
  | 'APPROVER'
  | 'ENGINEER';

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

// ---- Travel + Trips ----

export type TripType = 'INTER_CITY' | 'INTRA_CITY';
export type TravelStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED';

export interface TravelRequest {
  id: string;
  userId: string;
  projectId: string;
  fromCityId: string;
  toCityId: string;
  startDate: string;
  endDate: string;
  travelClass: TravelClass;
  tripType: TripType;
  purpose: string;
  status: TravelStatus;
  approverId: string | null;
  approvedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  user: UserBrief & { gradeId?: string | null };
  project: { id: string; code: string; name: string; pmId: string };
  fromCity: { id: string; name: string; tier: CityTier };
  toCity: { id: string; name: string; tier: CityTier };
  approver: UserBrief | null;
  trip: Trip | null;
}

export interface Trip {
  id: string;
  travelRequestId: string;
  actualStart: string;
  actualEnd: string | null;
  daEligibleDays: string | null;
  daAmount: string | null;
  daCurrency: string | null;
  daBreakdown: DaDayBreakdown[] | null;
  travelActualCost: string;
  lodgingActualCost: string;
  localConveyanceActualCost: string;
}

export interface TripWithRequest extends Trip {
  travelRequest: {
    id: string;
    startDate: string;
    endDate: string;
    purpose: string;
    fromCity: { id: string; name: string; tier: CityTier };
    toCity: { id: string; name: string; tier: CityTier };
    project: { id: string; code: string; name: string };
  };
}

export interface DaDayBreakdown {
  date: string;
  factor: number;
  perDiem: string;
  amount: string;
  currency: string;
  reason: 'FULL_DAY' | 'DEPARTURE_DAY' | 'RETURN_DAY' | 'INTRA_CITY_NO_OVERNIGHT';
}

export interface DaResult {
  eligibleDays: number;
  total: { amount: string; currency: string };
  breakdown: DaDayBreakdown[];
}

// ---- Expenses + Reimbursements ----

export type ExpenseCategory =
  | 'TRAVEL'
  | 'LODGING'
  | 'MEALS'
  | 'LOCAL_CONVEYANCE'
  | 'COMMUNICATION'
  | 'MATERIALS'
  | 'OTHER';

export type ExpenseStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';

export interface Expense {
  id: string;
  userId: string;
  projectId: string;
  tripId: string | null;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  incurredOn: string;
  receiptUrl: string | null;
  notes: string | null;
  status: ExpenseStatus;
  approverId: string | null;
  approvedAt: string | null;
  rejectReason: string | null;
  user: UserBrief;
  project: { id: string; code: string; name: string; pmId: string };
  trip: { id: string; actualStart: string; actualEnd: string | null } | null;
  approver: UserBrief | null;
}

// ---- Receipts ----

export type ReceiptFlagKind =
  | 'DUPLICATE_HASH'
  | 'AMOUNT_OCR_MISMATCH'
  | 'DATE_OUT_OF_TRIP'
  | 'GPS_FAR_FROM_TRIP'
  | 'SUSPICIOUS_VENDOR'
  | 'NO_EXIF';

export type ReceiptFlagSeverity = 'INFO' | 'WARN' | 'BLOCK';

export interface ReceiptFlag {
  id: string;
  receiptId: string;
  kind: ReceiptFlagKind;
  severity: ReceiptFlagSeverity;
  detail: string | null;
  createdAt: string;
}

export interface Receipt {
  id: string;
  expenseId: string;
  fileUrl: string;
  contentType: string;
  contentHash: string;
  perceptualHash: string | null;
  exifTimestamp: string | null;
  exifLat: string | null;
  exifLng: string | null;
  ocrAmount: string | null;
  flags: ReceiptFlag[];
  createdAt: string;
}

// ---- Reimbursements ----

export type ReimbursementStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';

export interface Reimbursement {
  id: string;
  userId: string;
  totalAmount: string;
  currency: string;
  status: ReimbursementStatus;
  paidOn: string | null;
  reference: string | null;
  createdAt: string;
  user: UserBrief;
  expenses: Array<{
    id: string;
    category: ExpenseCategory;
    amount: string;
    currency: string;
    incurredOn: string;
    notes: string | null;
    project: { id: string; code: string; name: string };
  }>;
}

export interface ReimbursementEligibleGroup {
  user: UserBrief;
  totalAmount: string;
  currency: string;
  expenses: Array<{
    id: string;
    category: ExpenseCategory;
    amount: string;
    currency: string;
    incurredOn: string;
    notes: string | null;
    project: { id: string; code: string; name: string };
  }>;
}

// ---- Attendance (Slice 2C) ----

export type AttendanceEventKind =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'GEOFENCE_ENTER'
  | 'GEOFENCE_EXIT'
  | 'MANUAL_ENTRY';

export type AttendanceDayStatus =
  | 'ABSENT'
  | 'REMOTE'
  | 'ON_SITE'
  | 'PARTIAL'
  | 'REGULARIZED';

export type RegularizationReason =
  | 'REMOTE_WORK'
  | 'MISSED_PUNCH'
  | 'SITE_VISIT_NOT_GEOFENCED'
  | 'SICK'
  | 'PERSONAL'
  | 'OTHER';

export type RegularizationStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface AttendanceDay {
  id: string;
  userId: string;
  date: string;
  firstEventAt: string | null;
  lastEventAt: string | null;
  onSiteMinutes: number;
  projectSiteIds: string[];
  status: AttendanceDayStatus;
  eventCount: number;
  derivationNote: string | null;
  regularizationId: string | null;
  regularization?: AttendanceRegularization | null;
  recomputedAt: string;
}

export interface AttendanceRegularization {
  id: string;
  userId: string;
  date: string;
  reason: RegularizationReason;
  notes: string;
  projectId: string | null;
  status: RegularizationStatus;
  approverId: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  user: UserBrief;
  project: { id: string; code: string; name: string } | null;
  approver: UserBrief | null;
}

// ---- Change Requests (Slice 2D) ----

export type ChangeRequestType = 'SCOPE' | 'TIME' | 'COST' | 'MIXED';
export type ChangeRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface ChangeRequest {
  id: string;
  projectId: string;
  code: string;
  title: string;
  type: ChangeRequestType;
  reason: string;
  contractValueDelta: string | null;
  budgetDelta: string | null;
  daysDelta: number | null;
  scopeDelta: string | null;
  status: ChangeRequestStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  project: { id: string; code: string; name: string; pmId: string; ownerId: string | null };
  createdBy: UserBrief;
  approver: UserBrief | null;
}

export interface ProjectBaseline {
  baseline: {
    contractValue: string;
    contractCurrency: string;
    budget: string | null;
    budgetCurrency: string | null;
    plannedStart: string;
    plannedEnd: string;
    snapshotAt: string;
  };
  current: {
    contractValue: string;
    contractCurrency: string;
    budget: string | null;
    budgetCurrency: string | null;
    plannedStart: string;
    plannedEnd: string;
  };
  delta: {
    contractValue: string;
    budget: string;
    days: number;
  };
}

// ---- Comments (Slice 2E) ----

export type CommentEntityKind =
  | 'PROJECT'
  | 'TASK'
  | 'EXPENSE'
  | 'TRIP'
  | 'CHANGE_REQUEST'
  | 'ATTENDANCE_REGULARIZATION'
  | 'RECEIPT';

export interface Comment {
  id: string;
  entityKind: CommentEntityKind;
  entityId: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  author: UserBrief;
}

// ---- Anomalies (Slice 2E) ----

export type AnomalyKind =
  | 'RECEIPT_DUPLICATE'
  | 'RECEIPT_AMOUNT_MISMATCH'
  | 'RECEIPT_DATE_OUT_OF_TRIP'
  | 'RECEIPT_GPS_FAR'
  | 'ALLOCATION_OVERBOOK'
  | 'PROJECT_OVER_BUDGET'
  | 'PROJECT_MARGIN_RED'
  | 'EXPENSE_OVER_CAP'
  | 'ATTENDANCE_NO_PUNCH'
  | 'ATTENDANCE_REGULARIZATION_STALE';

export type AnomalySeverity = 'INFO' | 'WARN' | 'CRITICAL';

export interface AnomalyRule {
  id: string;
  kind: AnomalyKind;
  name: string;
  description: string;
  severity: AnomalySeverity;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Anomaly {
  id: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  entityKind: string;
  entityId: string;
  fingerprint: string;
  detail: string | null;
  context: Record<string, unknown> | null;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
}
