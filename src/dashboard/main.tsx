import { createRoot } from 'react-dom/client';
import '@/ui/theme.css';
import '@/ui/components.css';
import './dashboard.css';
import { Dashboard } from './Dashboard';

const container = document.getElementById('root');
if (!container) throw new Error('Dashboard root element missing.');
createRoot(container).render(<Dashboard />);
