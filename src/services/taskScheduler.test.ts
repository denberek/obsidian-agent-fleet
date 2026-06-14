import { describe, expect, it, vi } from "vitest";
import { TaskScheduler } from "./taskScheduler";
import type { TaskConfig } from "../types";

function createTask(overrides: Partial<TaskConfig> = {}): TaskConfig {
  return {
    filePath: "_fleet/tasks/demo.md",
    taskId: "demo",
    agent: "agent",
    type: "recurring",
    priority: "medium",
    schedule: "every 30m",
    enabled: true,
    created: new Date().toISOString(),
    runCount: 0,
    catchUp: false,
    tags: [],
    body: "Do the thing",
    ...overrides,
  };
}

describe("TaskScheduler", () => {
  it("parses shorthand schedules", () => {
    const scheduler = new TaskScheduler(1, {
      onTaskTriggered: vi.fn(async () => undefined),
      onTaskScheduled: vi.fn(async () => undefined),
    });

    expect(scheduler.parseSchedule("every 30m")).toBe("*/30 * * * *");
    expect(scheduler.parseSchedule("0 9 * * *")).toBe("0 9 * * *");
  });

  it("queues runs when paused and resumes them", async () => {
    const onTaskTriggered = vi.fn(async () => undefined);
    const scheduler = new TaskScheduler(1, {
      onTaskTriggered,
      onTaskScheduled: vi.fn(async () => undefined),
    });

    scheduler.pauseAll();
    await scheduler.enqueue({ task: createTask(), reason: "manual" });
    expect(onTaskTriggered).not.toHaveBeenCalled();

    scheduler.resumeAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onTaskTriggered).toHaveBeenCalledTimes(1);
  });

  it("drops queued runs and stops firing after shutdown", async () => {
    const onTaskTriggered = vi.fn(async () => undefined);
    const scheduler = new TaskScheduler(1, {
      onTaskTriggered,
      onTaskScheduled: vi.fn(async () => undefined),
    });

    scheduler.pauseAll();
    await scheduler.enqueue({ task: createTask(), reason: "manual" });
    scheduler.shutdown();
    scheduler.resumeAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Without shutdown, resumeAll would flush the queued run. After shutdown,
    // the queue is empty and no cron is left to fire.
    expect(onTaskTriggered).not.toHaveBeenCalled();
  });
});
