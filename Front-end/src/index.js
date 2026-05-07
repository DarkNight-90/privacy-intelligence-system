/**
 * React App Entry Point
 * Renders the Dashboard component into the extension popup/dashboard
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');

  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  } else {
    console.error('Root element not found. Make sure your HTML has <div id="root"></div>');
  }
});