import bcrypt from "bcryptjs";
import { User } from "../config/database.js";

const defaultDemoAdmin = {
  email: "admin.bella@example.com",
  password: "Password123!",
  firstName: "Bella",
  lastName: "Admin",
  phone: "+84 909 111 222",
};

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return value === "true";
}

function shouldBootstrapDemoAdmin() {
  return parseBoolean(
    process.env.ENABLE_DEMO_ADMIN_BOOTSTRAP,
    process.env.NODE_ENV !== "production",
  );
}

function shouldSyncDemoAdminPassword() {
  return parseBoolean(
    process.env.DEMO_ADMIN_SYNC_PASSWORD,
    process.env.NODE_ENV !== "production",
  );
}

function getDemoAdminConfig() {
  return {
    email: (process.env.DEMO_ADMIN_EMAIL || defaultDemoAdmin.email).trim().toLowerCase(),
    password: process.env.DEMO_ADMIN_PASSWORD || defaultDemoAdmin.password,
    firstName: (process.env.DEMO_ADMIN_FIRST_NAME || defaultDemoAdmin.firstName).trim(),
    lastName: (process.env.DEMO_ADMIN_LAST_NAME || defaultDemoAdmin.lastName).trim(),
    phone: (process.env.DEMO_ADMIN_PHONE || defaultDemoAdmin.phone).trim(),
  };
}

export async function ensureDemoAdmin({ syncPassword = shouldSyncDemoAdminPassword() } = {}) {
  if (!shouldBootstrapDemoAdmin()) {
    return { skipped: true, reason: "bootstrap_disabled" };
  }

  const config = getDemoAdminConfig();
  if (!config.email || !config.password) {
    return { skipped: true, reason: "missing_credentials" };
  }

  const user = await User.findOne({ email: config.email });

  if (!user) {
    const createdUser = await User.create({
      email: config.email,
      password: await bcrypt.hash(config.password, 10),
      firstName: config.firstName,
      lastName: config.lastName,
      phone: config.phone,
      role: "admin",
      sessionVersion: 0,
    });

    return {
      created: true,
      email: createdUser.email,
      role: createdUser.role,
    };
  }

  let changed = false;

  if (user.role !== "admin") {
    user.role = "admin";
    changed = true;
  }

  if (user.firstName !== config.firstName) {
    user.firstName = config.firstName;
    changed = true;
  }

  if (user.lastName !== config.lastName) {
    user.lastName = config.lastName;
    changed = true;
  }

  if ((user.phone || "") !== config.phone) {
    user.phone = config.phone;
    changed = true;
  }

  if (syncPassword) {
    user.password = await bcrypt.hash(config.password, 10);
    changed = true;
  }

  if (changed) {
    await user.save();
    return {
      updated: true,
      email: user.email,
      role: user.role,
      passwordSynced: syncPassword,
    };
  }

  return {
    found: true,
    email: user.email,
    role: user.role,
    passwordSynced: false,
  };
}

export function getDemoAdminCredentials() {
  const config = getDemoAdminConfig();

  return {
    email: config.email,
    password: config.password,
  };
}
