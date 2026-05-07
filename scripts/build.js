#!/usr/bin/env node

/**
 * Simple Build Script for React Dashboard
 * Alternative to webpack for environments without build tools
 */

const fs = require('fs');
const path = require('path');

// Simple JSX transformer (basic implementation)
function transformJSX(code) {
  // This is a very basic JSX transformer
  // In production, use a proper bundler like webpack + babel
  return code
    .replace(/import React from 'react';/g, '') // Remove React import
    .replace(/import \{ ([^}]+) \} from 'recharts';/g, 'const { $1 } = Recharts;')
    .replace(/import ([^}]+) from '\.\/([^']+)';/g, '') // Remove local imports
    .replace(/<([A-Z][^>\s]*)/g, 'React.createElement("$1"') // Basic JSX transform
    .replace(/\/>/g, '})') // Self-closing tags
    .replace(/>([^<]*)</g, ', "$1")') // Text content
    .replace(/<\/[A-Z][^>]*>/g, ')'); // Closing tags
}

// Build function
function build() {
  console.log('Building React Dashboard...');

  const srcDir = path.join(__dirname, 'src');
  const distDir = path.join(__dirname, 'extension', 'dashboard', 'dist');

  // Create dist directory
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Read source files
  const appJsx = fs.readFileSync(path.join(srcDir, 'App.jsx'), 'utf8');
  const dashboardJsx = fs.readFileSync(path.join(srcDir, 'components', 'Dashboard.jsx'), 'utf8');
  const hookJs = fs.readFileSync(path.join(srcDir, 'hooks', 'usePrivacyData.js'), 'utf8');
  const serviceJs = fs.readFileSync(path.join(srcDir, 'services', 'chromeStorage.js'), 'utf8');
  const indexJs = fs.readFileSync(path.join(srcDir, 'index.js'), 'utf8');

  // Simple bundle (in production, use webpack)
  const bundle = `
// React and Recharts (load from CDN in HTML)
const React = { createElement: function(type, props, ...children) {
  if (typeof type === 'function') return type(props || {}, ...children);
  const element = { type, props: props || {}, children };
  return element;
}};
const ReactDOM = { createRoot: (container) => ({
  render: (element) => {
    // Simple render function - replace with proper React rendering
    container.innerHTML = '<div>React Dashboard Loading...</div>';
    console.log('React element:', element);
  }
})};

// Recharts placeholder
const Recharts = {
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: () => null,
  LineChart: () => null,
  Line: () => null
};

// Service layer
${serviceJs}

// Hook
${hookJs.replace(/import chromeStorageService from '\.\.\/services\/chromeStorage\.js';/, '')}

// Components
const Dashboard = ${transformJSX(dashboardJsx).replace(/import React, \{ useState \} from 'react';/g, '').replace(/import \{ ([^}]+) \} from 'recharts';/g, '').replace(/import usePrivacyData from '\.\.\/hooks\/usePrivacyData\.js';/g, '')};

const App = ${transformJSX(appJsx).replace(/import React from 'react';/g, '').replace(/import Dashboard from '\.\/components\/Dashboard\.jsx';/g, '')};

// Entry point
${indexJs.replace(/import React from 'react';/g, '').replace(/import \{ createRoot \} from 'react-dom\/client';/g, '').replace(/import App from '\.\/App\.jsx';/g, '')}
`;

  // Write bundle
  fs.writeFileSync(path.join(distDir, 'bundle.js'), bundle);
  console.log('✅ Build complete! Bundle saved to extension/dashboard/dist/bundle.js');
}

if (require.main === module) {
  build();
}

module.exports = { build };