// Leave supabaseUrl empty to run the on-device preview backend.
// The anon key is a public identifier by design; row-level security in
// supabase/migrations is what protects data. Never put a service-role key here.
export const CONFIG = {
  appVersion: '1.0.0',
  supabaseUrl: '',
  supabaseAnonKey: '',
  // Optional analytics sink: (eventName, fields) => void. Null keeps events in memory only.
  analyticsSink: null,
};
