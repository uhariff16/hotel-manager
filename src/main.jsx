import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Handle Vite dynamic import preload errors (usually caused by new deployments changing chunk hashes)
window.addEventListener('vite:preloadError', (event) => {
  console.log('Caught Vite preload error, reloading page...');
  const isReloaded = sessionStorage.getItem('vite-reloaded');
  if (!isReloaded) {
    sessionStorage.setItem('vite-reloaded', 'true');
    window.location.reload();
  }
});

// Clear the reload flag on successful load
sessionStorage.removeItem('vite-reloaded');


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
