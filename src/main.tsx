import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import './styles/index.css';

import swUrl from './utils/sw.js?url';
import { Toaster } from 'react-hot-toast';

// Create a client
const queryClient = new QueryClient();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl, { type: 'module' })
      .then((reg) =>
        console.log('Custom Service Worker registered successfully!', reg)
      )
      .catch((err) =>
        console.error('Service Worker registration failed:', err)
      );
  });
}

async function enableMocking() {
  if (!import.meta.env.DEV) {
    return;
  }

  const { worker } = await import('./mocks/browser.ts');

  // `worker.start()` returns a Promise that resolves once the Service Worker is up and running.
  return worker.start({
    serviceWorker: {
      url: '/react-record/mockServiceWorker.js',
    },
    onUnhandledRequest: 'warn', // Warns about requests that aren't mocked
  });
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </StrictMode>
  );
});
