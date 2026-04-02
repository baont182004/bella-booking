import { createContext, useContext, useState, useEffect } from "react";
import { userApi, setUserAuthToken } from "../services/api";

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  // When token changes, setup axios interceptor and fetch profile
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      setUserAuthToken(token);
      fetchProfile();
    } else {
      localStorage.removeItem("token");
      setUserAuthToken(null);
      setUser(null);
      setLoading(false);
    }
  }, [token]);

  const fetchProfile = async () => {
    try {
      // The API proxy might map this, or we can just point to /api/users/profile
      const res = await userApi.get("/users/profile");
      setUser(res.data.user);
    } catch (error) {
      console.error("Failed to fetch profile", error);
      setToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await userApi.post("/auth/login", { email, password });
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (userData) => {
    const res = await userApi.post("/auth/register", userData);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
