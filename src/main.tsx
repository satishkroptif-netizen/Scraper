import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import './styles.css';
import { App } from './App';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Step in Scraper could not find its app container.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
