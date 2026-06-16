import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// Kill any old service workers from previous PWA builds
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()));
}
if ('caches' in window) {
  caches.keys().then(k => k.forEach(x => caches.delete(x)));
}

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
);
