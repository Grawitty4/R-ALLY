import { colors } from '../theme';
import type { DerivedStatus, Member, StatusKind } from '../types';

export function inferStatus(member: Member, now = Date.now()): DerivedStatus {
  if (member.speedKmh >= 4) {
    return { kind: 'en_route' };
  }

  const minutesAgo = member.stoppedAt
    ? Math.max(0, Math.round((now - member.stoppedAt) / 60000))
    : undefined;
  const types = member.nearbyPlace?.types ?? [];

  if (types.includes('gas_station')) {
    return { kind: 'refueling', minutesAgo };
  }
  if (types.includes('restaurant') || types.includes('cafe')) {
    return { kind: 'eating', minutesAgo };
  }
  return { kind: 'stopped', minutesAgo };
}

export const statusCopy: Record<
  StatusKind,
  { label: string; icon: keyof typeof iconName; color: string }
> = {
  refueling: { label: 'Refueling', icon: 'gas', color: colors.amberDeep },
  eating: { label: 'Eating', icon: 'food', color: colors.rose },
  stopped: { label: 'Stopped', icon: 'pause', color: colors.rose },
  en_route: { label: 'En route', icon: 'nav', color: colors.teal },
};

const iconName = {
  gas: 'gas-station',
  food: 'silverware-fork-knife',
  pause: 'pause-circle-outline',
  nav: 'navigation-variant',
} as const;

export function statusChipText(status: DerivedStatus) {
  const { label } = statusCopy[status.kind];
  if (status.kind === 'en_route') return label;
  if (status.minutesAgo === undefined) return label;
  if (status.minutesAgo <= 0) return `${label} just now`;
  if (status.minutesAgo === 1) return `${label} 1 min`;
  return `${label} ${status.minutesAgo} min`;
}

export function statusDetail(status: DerivedStatus) {
  const { label } = statusCopy[status.kind];
  if (status.kind === 'en_route') return 'Moving with the group';
  if (status.minutesAgo === undefined) return label;
  if (status.minutesAgo <= 0) return `${label} · just now`;
  const unit = status.minutesAgo === 1 ? 'minute' : 'minutes';
  return `${label} · ${status.minutesAgo} ${unit} ago`;
}
