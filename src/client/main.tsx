// Styles first, so page stylesheets can override the base layer.
import './styles/base.css';
import './ui/ui.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { coldOpenFor } from './story/firstVisit';

// A first visit to the front door opens on the alley; keep it dark until the cold open loads.
if (coldOpenFor(location.pathname)) document.documentElement.dataset.cold = '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
