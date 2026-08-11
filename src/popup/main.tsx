import { createRoot } from 'react-dom/client';
import '@/ui/theme.css';
import '@/ui/components.css';
import './popup.css';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Popup root element missing.');
createRoot(container).render(<App />);
