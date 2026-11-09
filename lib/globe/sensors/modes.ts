export type SensorMode = 'aegis' | 'nvg' | 'flir' | 'crt' | 'noir' | 'raw'

export interface SensorModeInfo {
  id: SensorMode
  /** Keyboard shortcut (digit). */
  key: string
  label: string
  description: string
}

/** Order defines the 1-6 shortcuts and the selector layout. */
export const SENSOR_MODES: readonly SensorModeInfo[] = [
  { id: 'aegis', key: '1', label: 'AEGIS', description: 'Command grade' },
  { id: 'nvg', key: '2', label: 'NVG', description: 'Night vision' },
  { id: 'flir', key: '3', label: 'FLIR', description: 'Thermal' },
  { id: 'crt', key: '4', label: 'CRT', description: 'Terminal' },
  { id: 'noir', key: '5', label: 'NOIR', description: 'Monochrome' },
  { id: 'raw', key: '6', label: 'RAW', description: 'Untouched imagery' },
]

export const DEFAULT_SENSOR_MODE: SensorMode = 'aegis'

export function isSensorMode(value: unknown): value is SensorMode {
  return typeof value === 'string' && SENSOR_MODES.some((m) => m.id === value)
}

export function sensorModeForKey(key: string): SensorMode | null {
  return SENSOR_MODES.find((m) => m.key === key)?.id ?? null
}
