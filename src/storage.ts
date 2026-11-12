import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Storage } from './game';

export function createGameStorage(): Storage {
  if (Platform.OS === 'web') return AsyncStorage;
  const keyFor = (key: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
  return {
    getItem: async key => SecureStore.getItemAsync(await keyFor(key)),
    setItem: async (key, value) => SecureStore.setItemAsync(await keyFor(key), value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    removeItem: async key => SecureStore.deleteItemAsync(await keyFor(key)),
  };
}

export const gameStorage = createGameStorage();
export const newRequestId = () => Crypto.randomUUID();
