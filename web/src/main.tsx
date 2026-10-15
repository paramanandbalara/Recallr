import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { App } from './App';
import { loadSite } from './api';
import { loadBlocks } from './siteContent';
import { AuthProvider } from './auth';

// Business name, support email and download links come from Admin → Settings
// and the website's text from Admin → Website content (both at once; the defaults stay if either fails)
Promise.all([loadSite(), loadBlocks()]).finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
));
