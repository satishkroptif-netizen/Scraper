import raw from '@shared/defaults.json';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = raw as Settings;

export const EXAMPLE_QUERIES = [
  'dentists in Austin, TX',
  'coffee shops in Portland, OR',
  'plumbers in Manchester, UK',
  'med spas in Miami, FL',
  'wedding photographers in Denver, CO',
];

export const MODE_META = {
  search: { label: 'Google Maps search', short: 'Search' },
  links: { label: 'Pasted links', short: 'Links' },
  country: { label: 'Multi-city search', short: 'Cities' },
} as const;
