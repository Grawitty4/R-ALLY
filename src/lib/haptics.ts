import * as Haptics from 'expo-haptics';

export function tap() {
  Haptics.selectionAsync().catch(() => undefined);
}

export function tapImpact() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

export function tapSuccess() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );
}
