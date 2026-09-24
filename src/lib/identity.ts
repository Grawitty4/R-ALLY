import AsyncStorage from '@react-native-async-storage/async-storage';

const ID_KEY = 'rally.deviceId';
const NAME_KEY = 'rally.displayName';

const PALETTE = [
  '#C47B12',
  '#2F8F7B',
  '#3D5A80',
  '#C45C4A',
  '#6B4C9A',
  '#2C6E49',
  '#B85C38',
  '#1D4E89',
];

function randomId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'YO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function colorFromId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % PALETTE.length;
  }
  return PALETTE[hash];
}

export async function getDeviceId() {
  const existing = await AsyncStorage.getItem(ID_KEY);
  if (existing) return existing;
  const next = randomId();
  await AsyncStorage.setItem(ID_KEY, next);
  return next;
}

export async function getSavedName() {
  return (await AsyncStorage.getItem(NAME_KEY)) ?? '';
}

export async function saveName(name: string) {
  await AsyncStorage.setItem(NAME_KEY, name.trim());
}
