import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { ErroApi } from './api/cliente';
import { rotas } from './App';
import './estilos/app.css';

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Erros 4xx não melhoram com nova tentativa
      retry: (tentativas, erro) => !(erro instanceof ErroApi && erro.status >= 400 && erro.status < 500) && tentativas < 2,
    },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <RouterProvider router={rotas} />
    </QueryClientProvider>
  </StrictMode>,
);
