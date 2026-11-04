import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS, needsModel, type Settings } from '../shared/types.ts';

export interface SettingsState {
  settings: Settings;
  /** False until the saved settings have arrived; till then `settings` are only the defaults. */
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsState>({ settings: DEFAULT_SETTINGS, loaded: false, update: async () => {} });

export function useSettings(): SettingsState {
  return useContext(SettingsContext);
}

/** Whether the saved settings leave the partner without a model -- never while they are still loading, or failed to. */
export function useNeedsModel(): boolean {
  const { settings, loaded } = useSettings();
  return loaded && needsModel(settings);
}
