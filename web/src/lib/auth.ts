import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type AuthProfile = {
  user_id: string;
  display_name: string | null;
  role: "user" | "admin";
};

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return null;
  return user;
}

export async function ensureProfile(userId: string, email?: string | null): Promise<AuthProfile> {
  const supabase = await createClient();
  const existing = await getProfileByUserId(userId);
  if (existing) return existing;

  const displayName = email?.split("@")[0] ?? null;
  const { data, error } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: displayName, role: "user" })
    .select("user_id, display_name, role")
    .single<AuthProfile>();

  if (error) throw new Error(error.message);
  return data;
}

async function getProfileByUserId(userId: string): Promise<AuthProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, display_name, role")
    .eq("user_id", userId)
    .maybeSingle<AuthProfile>();

  if (error) throw new Error(error.message);
  return data;
}

export async function getCurrentProfile(): Promise<AuthProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  return (await getProfileByUserId(user.id)) ?? ensureProfile(user.id, user.email);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await ensureProfile(user.id, user.email);
  return user;
}

export async function requireAdmin(): Promise<AuthProfile> {
  const user = await requireUser();
  const profile = await ensureProfile(user.id, user.email);
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
