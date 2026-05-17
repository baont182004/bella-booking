import dotenv from "dotenv";
import { connectDatabase } from "./src/config/database.js";
import { ensureDemoAdmin, getDemoAdminCredentials } from "./src/utils/demoAdmin.js";

dotenv.config({ path: new URL("../../.env", import.meta.url) });
dotenv.config();

try {
  await connectDatabase();
  const result = await ensureDemoAdmin({ syncPassword: true });
  const credentials = getDemoAdminCredentials();

  console.log(
    JSON.stringify(
      {
        result,
        credentials,
      },
      null,
      2,
    ),
  );

  process.exit(0);
} catch (error) {
  console.error("Failed to ensure demo admin:", error);
  process.exit(1);
}
