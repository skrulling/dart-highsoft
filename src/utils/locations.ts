export const LOCATIONS = [
  { value: 'bergen', label: 'Bergen' },
  { value: 'vik', label: 'Vik' },
] as const;

export type LocationValue = (typeof LOCATIONS)[number]['value'];
