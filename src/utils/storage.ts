import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  LOGS_BUFFER: 'telling_logs_buffer',
  FIRST_OPEN: 'telling_first_open',
  LAST_APP_VERSION: 'telling_last_app_version',
  UPDATE_SNOOZED_UNTIL: 'telling_update_snoozed_until',
  SNOOZED_MIN_VERSION: 'telling_snoozed_min_version',
} as const;

export async function getStorageItem(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function setStorageItem(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function getStringList(key: string): Promise<string[] | null> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return null;
  }
}

export async function setStringList(key: string, value: string[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
