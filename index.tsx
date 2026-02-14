import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode is kept, but note that it may cause double-invocations in dev mode, 
  // which our socket logic needs to handle gracefully.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);