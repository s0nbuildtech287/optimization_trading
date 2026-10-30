import { lazy } from 'react';

// project imports
import Loadable from 'components/Loadable';
import AuthLayout from 'layout/Auth';

// jwt auth
const LoginPage = Loadable(lazy(() => import('pages/auth/Login')));
const RegisterPage = Loadable(lazy(() => import('pages/auth/Register')));
const LandingPage = Loadable(lazy(() => import('pages/public/Landing')));

// ==============================|| AUTH ROUTING ||============================== //

const LoginRoutes = {
  path: '/',
  element: <AuthLayout />,
  children: [
    {
      index: true,
      element: <LandingPage />
    },
    {
      path: 'login',
      element: <LoginPage />
    },
    {
      path: 'register',
      element: <RegisterPage />
    }
  ]
};

export default LoginRoutes;
