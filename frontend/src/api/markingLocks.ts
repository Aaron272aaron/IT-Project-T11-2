import { apiFetch } from "./auth";
export type AnswerTarget = { examId: string; questionId: string; studentId: string };
export type Lease = { editable: boolean; available?: boolean; owner?: string; token?: string; expiresAt?: number };
const tokens = new Map<string, string>();
export const targetKey = (target: AnswerTarget) => JSON.stringify([target.examId, target.questionId, target.studentId]);
export const markingLockHeaders = () => ({ "X-Marking-Locks": JSON.stringify(Object.fromEntries(tokens)) });
export async function markingLock(target: AnswerTarget, action: "acquire" | "renew" | "release" | "inspect", token?: string): Promise<Lease> {
  const response = await apiFetch("/api/marking-locks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, action, token }), keepalive: action === "release",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Cannot verify the marking lock. This answer is read only.");
  if (result.editable && result.token) tokens.set(targetKey(target), result.token);
  // In-flight saves already captured their token; later group/configuration
  // saves must not inherit credentials for an answer we have left.
  if (action === "release" && tokens.get(targetKey(target)) === token) tokens.delete(targetKey(target));
  return result;
}
