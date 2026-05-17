import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/auth-context";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Home from "./pages/Home";
import RoomsPage from "./pages/RoomsPage";
import RoomDetailPage from "./pages/RoomDetailPage";
import CombosPage from "./pages/CombosPage";
import BookingLookup from "./pages/BookingLookup";
import AdminPanel from "./pages/AdminPanel";
import PaymentReturnPage from "./pages/PaymentReturnPage";
import SiteLayout from "./components/SiteLayout";

const PrivateRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-loading">
        <div className="shell-container">
          <div className="empty-state">Đang tải tài khoản Bella của bạn...</div>
        </div>
      </div>
    );
  }

  return token ? children : <Navigate to="/login" />;
};

const PublicRoute = ({ children }) => {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-loading">
        <div className="shell-container">
          <div className="empty-state">Đang kiểm tra tài khoản Bella của bạn...</div>
        </div>
      </div>
    );
  }

  return !token ? children : <Navigate to="/dashboard" />;
};

const AdminRoute = ({ children }) => {
  const { token, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-loading">
        <div className="shell-container">
          <div className="empty-state">Đang kiểm tra quyền quản trị Bella...</div>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" />;
  }

  return user?.role === "admin" ? children : <Navigate to="/dashboard" />;
};

function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/combos" element={<CombosPage />} />
        <Route path="/combos/:slug" element={<CombosPage />} />
        <Route path="/lookup" element={<BookingLookup />} />
        <Route path="/rooms/:code" element={<RoomDetailPage />} />
        <Route path="/hotels" element={<Navigate to="/" replace />} />
        <Route path="/hotels/:hotelId" element={<Navigate to="/" replace />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <PrivateRoute>
              <Bookings />
            </PrivateRoute>
          }
        />
        <Route
          path="/payments/return"
          element={
            <PrivateRoute>
              <PaymentReturnPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPanel />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
