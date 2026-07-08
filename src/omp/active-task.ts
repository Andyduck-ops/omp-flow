import * as fs from 'fs';
import * as path from 'path';

export function readActiveTaskId(workspaceDir: string): string {
  const activeTaskPath = path.join(workspaceDir, '.omp-flow', 'tasks', '.active-task');
  const taskId = fs.readFileSync(activeTaskPath, 'utf-8').trim();
  if (!taskId) {
    throw new Error('Active task file is empty: .omp-flow/tasks/.active-task');
  }
  return taskId;
}
