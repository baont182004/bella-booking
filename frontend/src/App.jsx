import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Home from "./pages/Home";
import RoomDetailPage from "./pages/RoomDetailPage";
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

function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
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
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
