import { markingLockHeaders } from "./markingLocks";
import { apiFetch } from './auth';
import type { ExamRegistry } from '../models/exams';

export async function loadExamRegistry(): Promise<{ registry: ExamRegistry; revision: number }> {
  const response = await apiFetch('/api/exams');
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Could not load saved exams.');
  return result;
}
export async function saveExamRegistry(registry: ExamRegistry, revision: number): Promise<number> {
  let response: Response;
  try {
    response = await apiFetch('/api/exams', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...markingLockHeaders() },
      body: JSON.stringify({ registry, revision }),
    });
  } catch {
    throw new Error('Cannot reach exam storage. Check the backend and retry.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'The exam could not be saved.');
  return result.revision;
}
