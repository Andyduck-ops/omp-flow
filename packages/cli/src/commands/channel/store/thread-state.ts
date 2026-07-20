export {
  reduceThreads,
  buildThreadAliasResolver,
  collectThreadTimeline,
} from "omp-flow-core/channel";

export type {
  ThreadState,
  ThreadAliasResolver,
} from "omp-flow-core/channel";

import type { ThreadState } from "omp-flow-core/channel";

export function formatThreadBoard(states: ThreadState[]): string[] {
  if (states.length === 0) return ["(no threads)"];
  return [
    "THREAD  STATUS  TITLE",
    ...states.map((state) => {
      const labels =
        state.labels.length > 0 ? ` labels=${state.labels.join(",")}` : "";
      const assignees =
        state.assignees.length > 0
          ? ` assignees=${state.assignees.join(",")}`
          : "";
      return `${state.thread} [${state.status}] ${state.title ?? ""}${labels}${assignees}`;
    }),
  ];
}
