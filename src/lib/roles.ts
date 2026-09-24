export type RoleId = 'rider' | 'marshal' | 'head_marshal' | 'admin';

export type PrivilegeId = string;

export type RoleDefinition = {
  id: RoleId;
  label: string;
  rank: number;
  /** If true, head marshal / admin can assign this role to riders. */
  assignable: boolean;
  /** Fill this in later — marshal tools, pings, route edits, etc. */
  privileges: PrivilegeId[];
};

export const ROLE_CATALOG: Record<RoleId, RoleDefinition> = {
  rider: {
    id: 'rider',
    label: 'Rider',
    rank: 10,
    assignable: true,
    privileges: [],
  },
  marshal: {
    id: 'marshal',
    label: 'Marshal',
    rank: 20,
    assignable: true,
    privileges: [],
  },
  head_marshal: {
    id: 'head_marshal',
    label: 'Head marshal',
    rank: 30,
    assignable: false,
    privileges: [],
  },
  admin: {
    id: 'admin',
    label: 'Admin',
    rank: 40,
    assignable: false,
    privileges: [],
  },
};

export const CREATOR_ROLES: RoleId[] = ['admin', 'head_marshal'];
export const JOINER_ROLES: RoleId[] = ['rider'];

export const ASSIGNABLE_ROLES = Object.values(ROLE_CATALOG).filter(
  (role) => role.assignable,
);

export function normalizeRoles(input: unknown): RoleId[] {
  const allowed = new Set(Object.keys(ROLE_CATALOG) as RoleId[]);
  const list = Array.isArray(input) ? input : [];
  const next = list.filter((item): item is RoleId => allowed.has(item as RoleId));
  return next.length > 0 ? [...new Set(next)] : [...JOINER_ROLES];
}

export function primaryRole(roleIds: RoleId[]): RoleDefinition {
  return [...roleIds]
    .map((id) => ROLE_CATALOG[id])
    .sort((a, b) => b.rank - a.rank)[0] ?? ROLE_CATALOG.rider;
}

export function memberCanAssignRoles(roleIds: RoleId[]) {
  return roleIds.includes('admin') || roleIds.includes('head_marshal');
}

export function memberHasPrivilege(roleIds: RoleId[], privilege: PrivilegeId) {
  return roleIds.some((id) => ROLE_CATALOG[id]?.privileges.includes(privilege));
}

export function applyAssignableRole(current: RoleId[], next: RoleId): RoleId[] {
  const locked = current.filter((id) => !ROLE_CATALOG[id]?.assignable);
  return [...new Set([...locked, next])];
}
