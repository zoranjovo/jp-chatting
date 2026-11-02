import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types.ts';

export interface SettingsState {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsState>({ settings: DEFAULT_SETTINGS, update: async () => {} });

export function useSettings(): SettingsState {
  return useContext(SettingsContext);
}
