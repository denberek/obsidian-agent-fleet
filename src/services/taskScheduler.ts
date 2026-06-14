import { Cron } from "croner";
import type { PendingRun, TaskConfig } from "../types";

interface SchedulerCallbacks {
  onTaskTriggered: (pendingRun: PendingRun) => Promise<void>;
  onTaskScheduled: (task: TaskConfig, nextRun?: string) => Promise<void>;
}

const SCHEDULE_SHORTCUTS: Record<string, string> = {
  "every 5m": "*/5 * * * *",
  "every 10m": "*/10 * * * *",
  "every 15m": "*/15 * * * *",
  "every 30m": "*/30 * * * *",
  "every 1h": "0 * * * *",
  "every 2h": "0 */2 * * *",
  hourly: "0 * * * *",
  "daily at 9am": "0 9 * * *",
  "daily at 6pm": "0 18 * * *",
  "weekdays at 9am": "0 9 * * 1-5",
  "weekly on monday": "0 9 * * 1",
  "monthly on 1st": "0 9 1 * *",
};

export class TaskScheduler {
  private jobs = new Map<string, Cron>();
  private activeRuns = 0;
  private queue: PendingRun[] = [];
  private paused = false;

  constructor(
    private maxConcurrentRuns: number,
    private readonly callbacks: SchedulerCallbacks,
  ) {}

  setMaxConcurrentRuns(value: number): void {
    this.maxConcurrentRuns = value;
  }

  parseSchedule(input: string): string {
    return SCHEDULE_SHORTCUTS[input.toLowerCase()] ?? input;
  }

  private toLocalISOString(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  async registerTask(task: TaskConfig): Promise<void> {
    this.unregisterTask(task.taskId);
    if (!task.enabled || task.type === "immediate") {
      return;
    }

    try {
      if (task.type === "once" && task.runAt) {
        const job = new Cron(new Date(task.runAt), { name: task.taskId, catch: true }, () => {
          void this.enqueue({ task, reason: "scheduled" });
        });
        this.jobs.set(task.taskId, job);
        await this.callbacks.onTaskScheduled(task, task.runAt);
        return;
      }

      if (task.type === "recurring" && task.schedule) {
        const cronExpression = this.parseSchedule(task.schedule);
        const job = new Cron(
          cronExpression,
          {
            name: task.taskId,
            catch: true,
            protect: true,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          () => {
            void this.enqueue({ task, reason: "scheduled" });
          },
        );
        this.jobs.set(task.taskId, job);
        const nextRun = job.nextRun();
      await this.callbacks.onTaskScheduled(task, nextRun ? this.toLocalISOString(nextRun) : undefined);
      }
    } catch (error) {
      console.error(`Agent Fleet: Failed to register task "${task.taskId}":`, error);
    }
  }

  unregisterTask(taskId: string): void {
    const existing = this.jobs.get(taskId);
    if (existing) {
      existing.stop();
      this.jobs.delete(taskId);
    }
  }

  async loadTasks(tasks: TaskConfig[]): Promise<void> {
    for (const task of tasks) {
      await this.registerTask(task);
    }
  }

  async handleStartupCatchUp(tasks: TaskConfig[]): Promise<void> {
    const now = Date.now();
    for (const task of tasks) {
      if (!task.enabled || !task.catchUp || !task.nextRun) {
        continue;
      }
      if (new Date(task.nextRun).getTime() < now) {
        await this.enqueue({ task, reason: "catch-up" });
      }
    }
  }

  async enqueue(pendingRun: PendingRun): Promise<void> {
    this.queue.push(pendingRun);
    await this.processQueue();
  }

  pauseAll(): void {
    this.paused = true;
    this.jobs.forEach((job) => job.pause());
  }

  resumeAll(): void {
    this.paused = false;
    this.jobs.forEach((job) => job.resume());
    void this.processQueue();
  }

  /** Stop every cron permanently and drop the pending queue. Used when the
   *  owning runtime is being replaced (saveSettings rebuild) or the plugin
   *  is unloading — otherwise the underlying croner timers keep firing
   *  forever, even after the scheduler reference is dropped. */
  shutdown(): void {
    this.paused = true;
    this.jobs.forEach((job) => job.stop());
    this.jobs.clear();
    this.queue.length = 0;
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  private async processQueue(): Promise<void> {
    if (this.paused) {
      return;
    }
    while (this.activeRuns < this.maxConcurrentRuns && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) {
        return;
      }
      this.activeRuns += 1;
      void this.callbacks
        .onTaskTriggered(next)
        .finally(async () => {
          this.activeRuns -= 1;
          await this.processQueue();
        });
    }
  }
}
