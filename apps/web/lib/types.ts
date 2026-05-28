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
