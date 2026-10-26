/// <reference types="vite/client" />

import type { MapScraperBridge } from './lib/types';

declare global {
  interface Window {
    mapscraper?: MapScraperBridge;
  }
}

export {};
