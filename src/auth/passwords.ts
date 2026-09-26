import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { passwordProblem } from "@/auth/gate";
import { findCredential, saveCredential } from "@/storage/workspace-book";

export async function storeLocalPassword(email: string, password: string): Promise<string | null> {
  const problem = passwordProblem(password);
  if (problem) return problem;
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(password, salt, 32).toString("hex");
  await saveCredential({ email: email.trim().toLowerCase(), salt, passwordHash });
  return null;
}

export async function localPasswordMatches(email: string, password: string): Promise<boolean> {
  const credential = await findCredential(email);
  if (!credential) return false;
  const next = scryptSync(password, credential.salt, 32);
  const saved = Buffer.from(credential.passwordHash, "hex");
  if (saved.length !== next.length) return false;
  return timingSafeEqual(saved, next);
}
