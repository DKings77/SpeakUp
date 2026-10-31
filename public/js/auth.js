// =====================================================================
// Cliente Supabase + login (un único usuario, email + contraseña)
// =====================================================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function currentSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function login(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Email o contraseña incorrectos");
}

export async function logout() {
  await sb.auth.signOut();
}
