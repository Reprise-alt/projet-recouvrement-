import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './hooks/useToast';
import { PaliersConfigProvider } from './lib/paliersConfig';
import { ImpersonationBanner } from './components/ImpersonationBanner';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <PaliersConfigProvider>
          <ImpersonationBanner />
          <App />
        </PaliersConfigProvider>
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
);
