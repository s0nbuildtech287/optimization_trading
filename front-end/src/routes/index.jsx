import { createBrowserRouter } from 'react-router-dom';

// project imports
import MainRoutes from './MainRoutes';
import LoginRoutes from './LoginRoutes';
import DemoRoutes from './DemoRoutes';

// ==============================|| ROUTING RENDER ||============================== //

const router = createBrowserRouter([LoginRoutes, DemoRoutes, MainRoutes], { basename: import.meta.env.VITE_APP_BASE_NAME });

export default router;
