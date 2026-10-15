import { recommendFix, AiReviewError, type FixRecommendation, type SavedAiReview } from "../api/ai";
import { modelDownloadRequest } from "../api/modelDownload";

export type AiReviewTask = {
  workspaceId: string;
  responseKey: string;
  questionKey: string;
  code: string;
};
export const aiReviewKey = (task: AiReviewTask) =>
  JSON.stringify([
    task.workspaceId,
    task.responseKey,
    task.questionKey,
    task.code,
  ]);
export type AiReviewRecord = {
  task: AiReviewTask;
  status: "queued" | "running" | "done" | "error";
  result?: FixRecommendation;
  error: string;
  comment: string;
  rejected: boolean;
  force?: boolean;
};
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

// Completed reviews are restored from backend storage before this queue starts.
export class AiReviewQueue {
  private saved = new Map<string, SavedAiReview>();
  restore(reviews: SavedAiReview[]) {
    this.saved = new Map(reviews.map((review) => [review.key, review]));
  }
  private records = new Map<string, AiReviewRecord>();
  private listeners = new Set<() => void>();
  private version = 0;
  private enabled = false;
  private paused = false;
  private blocked = "";
  private priority: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: { key: string; controller: AbortController } | null = null;
  private polling: AbortController | null = null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getVersion = () => this.version;
  get = (key: string) => this.records.get(key);
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  private schedule(ms = 0) {
    if (
      !this.enabled ||
      this.paused ||
      this.active ||
      this.timer ||
      this.polling
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.blocked) void this.checkModel();
      else void this.runNext();
    }, ms);
  }
  start() {
    this.enabled = true;
    this.schedule();
  }
  stop() {
    this.enabled = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.polling?.abort();
    this.polling = null;
    this.cancelActive();
  }
  private cancelActive() {
    if (!this.active) return;
    const { key, controller } = this.active;
    controller.abort();
    this.active = null;
    const record = this.records.get(key);
    if (record?.status === "running")
      this.records.set(key, { ...record, status: "queued" });
  }
  configure(tasks: AiReviewTask[]) {
    const keys = new Set(tasks.map(aiReviewKey));
    let changed = false;
    for (const key of this.records.keys()) {
      if (keys.has(key)) continue;
      if (this.active?.key === key) this.cancelActive();
      this.records.delete(key);
      changed = true;
    }
    for (const task of tasks) {
      const key = aiReviewKey(task);
      if (this.records.has(key)) continue;
      const saved = this.saved.get(key);
      this.records.set(key, {
        task,
        status: saved ? "done" : "queued",
        result: saved?.result,
        error: "",
        comment: saved?.comment ?? "",
        rejected: false,
      });
      changed = true;
    }
    this.priority = this.priority.filter((key) => keys.has(key));
    if (
      this.blocked &&
      ![...this.records.values()].some((record) => record.error)
    ) {
      this.blocked = "";
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.polling?.abort();
      this.polling = null;
    }
    if (changed) this.changed();
    this.schedule();
  }
  prioritize(task: AiReviewTask) {
    if (!task.code.trim()) return;
    const key = aiReviewKey(task);
    if (!this.records.has(key)) {
      const saved = this.saved.get(key);
      this.records.set(key, {
        task,
        status: saved ? "done" : "queued",
        result: saved?.result,
        error: "",
        comment: saved?.comment ?? "",
        rejected: false,
      });
      this.changed();
    }
    this.priority = [key, ...this.priority.filter((value) => value !== key)];
    this.schedule();
  }
  regenerate(task: AiReviewTask, comment = "") {
    const key = aiReviewKey(task);
    if (this.active?.key === key) this.cancelActive();
    this.records.set(key, {
      task,
      status: "queued",
      error: "",
      comment,
      force: true,
      rejected: false,
    });
    this.priority = [key, ...this.priority.filter((value) => value !== key)];
    this.resume();
  }
  reject(key: string) {
    const record = this.records.get(key);
    if (record) {
      this.records.set(key, { ...record, rejected: true });
      this.changed();
    }
  }
  pause() {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.polling?.abort();
    this.polling = null;
    this.cancelActive();
    this.changed();
  }
  resume() {
    this.paused = false;
    this.blocked = "";
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.polling?.abort();
    this.polling = null;
    for (const [key, record] of this.records) {
      if (
        record.status === "error" ||
        record.error
      )
        this.records.set(key, {
          ...record,
          status: "queued",
          result: undefined,
          force: true,
          error: "",
        });
    }
    this.changed();
    this.schedule();
  }
  progress() {
    const records = [...this.records.values()];
    const finished = records.filter(
      (record) => record.status === "done" || record.status === "error",
    ).length;
    const needsReview = records.filter(
      (record) =>
        record.status === "error" ||
        record.result?.status === "invalid_generation",
    ).length;
    return {
      total: records.length,
      finished,
      needsReview,
      percent: records.length
        ? Math.round((finished / records.length) * 100)
        : 0,
      paused: this.paused,
      waiting: this.blocked,
      running: Boolean(this.active),
    };
  }
  private async checkModel() {
    if (!this.enabled || this.paused || !this.blocked) return;
    const controller = new AbortController();
    this.polling = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const status = await modelDownloadRequest("status", controller.signal);
      if (this.polling !== controller || controller.signal.aborted) return;
      if (status.status === "ready") {
        this.blocked = "";
        for (const [key, record] of this.records) {
          if (record.status === "queued" && record.error)
            this.records.set(key, { ...record, error: "" });
        }
        this.changed();
      }
    } catch {
      /* Setup can finish later while the marker keeps working. */
    } finally {
      clearTimeout(timeout);
      if (this.polling === controller) {
        this.polling = null;
        this.schedule(this.blocked ? 10_000 : 0);
      }
    }
  }
  private async runNext() {
    if (!this.enabled || this.paused || this.blocked || this.active) return;
    const prioritized = this.priority.find(
      (key) => this.records.get(key)?.status === "queued",
    );
    const key =
      prioritized ??
      [...this.records].find(([, record]) => record.status === "queued")?.[0];
    if (!key) return;
    const record = this.records.get(key)!;
    const controller = new AbortController();
    this.active = { key, controller };
    this.records.set(key, { ...record, status: "running", error: "" });
    this.changed();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 120_000);
    try {
      let result: FixRecommendation;
      for (;;) {
        try {
          result = await recommendFix(
            record.task.code,
            controller.signal,
            record.comment,
            { reviewKey: key, force: record.force ?? false },
          );
          break;
        } catch (error) {
          if (
            !(error instanceof AiReviewError) ||
            error.status !== 429 ||
            controller.signal.aborted
          )
            throw error;
          await wait(2000, controller.signal);
        }
      }
      if (this.active?.controller !== controller || controller.signal.aborted)
        return;
      this.saved.set(key, { key, result, comment: record.comment });
      this.records.set(key, { ...record, force: false, status: "done", result, error: "" });
    } catch (error) {
      if (this.active?.controller !== controller) return;
      if (timedOut) {
        this.records.set(key, {
          ...record,
          status: "error",
          error:
            "AI review took too long. Retry this response or review it manually.",
        });
      } else if (!controller.signal.aborted) {
        const message =
          error instanceof Error ? error.message : "AI review is unavailable.";
        if (error instanceof AiReviewError && error.status === 422) {
          this.records.set(key, { ...record, status: "error", error: message });
        } else {
          this.blocked = message;
          this.records.set(key, {
            ...record,
            status: "queued",
            error: message,
          });
        }
      }
    } finally {
      clearTimeout(timeout);
      if (this.active?.controller === controller) {
        this.active = null;
        this.changed();
        this.schedule(this.blocked ? 10_000 : 0);
      }
    }
  }
}
