import { createClient } from "@supabase/supabase-js";
import { config } from "./env.ts";

if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) {
  throw new Error("Supabase configuration is missing");
}

const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SECRET_KEY,
);

export default supabase;