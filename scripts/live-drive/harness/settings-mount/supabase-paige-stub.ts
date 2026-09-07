import { supabase as sharedSupabase } from "../connections-mount/supabase-stub";

/** Settings-harness extension used only by the PAIGE rendered drive. */
export const supabase = {
  ...sharedSupabase,
  auth: {
    ...sharedSupabase.auth,
    getSession: () => Promise.resolve({
      data: {
        session: {
          access_token: "harness-access-token",
          user: { id: "harness-user" },
        },
      },
      error: null,
    }),
  },
};

export default { supabase };
