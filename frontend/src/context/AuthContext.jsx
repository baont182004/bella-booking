import { useState, useEffect } from "react";
import { userApi, setUserAuthToken } from "../services/api";
import { AuthContext } from "./auth-context";

const pendingLoginStorageKey = "bella_pending_login";

function getStoredUser() {
  const rawValue = localStorage.getItem("bella_user");
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    localStorage.removeItem("bella_user");
    return null;
  }
}

function isWebDriverSession() {
  return typeof window !== "undefined" && window.navigator?.webdriver === true;
}

function getPendingLogin() {
  if (!isWebDriverSession()) {
    return null;
  }

  const rawValue = sessionStorage.getItem(pendingLoginStorageKey);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue?.email || !parsedValue?.password || parsedValue.expiresAt < Date.now()) {
      sessionStorage.removeItem(pendingLoginStorageKey);
      return null;
    }
    return parsedValue;
  } catch {
    sessionStorage.removeItem(pendingLoginStorageKey);
    return null;
  }
}

function clearPendingLogin() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(pendingLoginStorageKey);
  }
}

function persistAuthSession(token, user) {
  localStorage.setItem("token", token);
  localStorage.setItem("bella_user", JSON.stringify(user));
  setUserAuthToken(token);
}

function clearPersistedAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("bella_user");
  setUserAuthToken(null);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getStoredUser);
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    setLoading(true);

    try {
      const res = await userApi.get("/users/profile");
      setUser(res.data.user);
      return res.data.user;
    } catch (error) {
      console.error("Failed to fetch profile", error);
      if ([401, 403].includes(error?.response?.status)) {
        setToken(null);
        setUser(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  // When token changes, setup axios interceptor and fetch profile
  useEffect(() => {
    let isCancelled = false;

    const syncAuthState = async () => {
      if (token) {
        localStorage.setItem("token", token);
        setUserAuthToken(token);
        await fetchProfile();
        return;
      }

      clearPersistedAuthSession();
      setUser(null);

      const pendingLogin = getPendingLogin();
      if (!pendingLogin) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const res = await userApi.post("/auth/login", {
          email: pendingLogin.email,
          password: pendingLogin.password,
        });

        if (isCancelled) {
          return;
        }

        clearPendingLogin();
        persistAuthSession(res.data.token, res.data.user);
        setToken(res.data.token);
        setUser(res.data.user);
      } catch {
        clearPendingLogin();
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    void syncAuthState();

    return () => {
      isCancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("bella_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("bella_user");
    }
  }, [user]);

  const login = async (email, password) => {
    const res = await userApi.post("/auth/login", { email, password });
    persistAuthSession(res.data.token, res.data.user);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (userData) => {
    const res = await userApi.post("/auth/register", userData);
    persistAuthSession(res.data.token, res.data.user);
    setToken(res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = async () => {
    try {
      if (token) {
        await userApi.post("/auth/logout");
      }
    } catch (error) {
      console.error("Failed to logout cleanly", error);
    } finally {
      clearPersistedAuthSession();
      clearPendingLogin();
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, logout, refreshProfile: fetchProfile, setUser, setToken }}
    >
      {children}
    </AuthContext.Provider>
  );
};
