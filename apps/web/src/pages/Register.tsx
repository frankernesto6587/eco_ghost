import { Navigate } from 'react-router-dom';

// Registration is now handled via tabs in the Login page
export default function RegisterPage() {
  return <Navigate to="/login" replace />;
}
