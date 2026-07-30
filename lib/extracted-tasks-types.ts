export type ExtractedTaskItem = {
  title: string;
  done?: boolean;
  notes?: string;
};

export type ExtractedTasksDoc = {
  id: string;
  subject: string;
  counterpart: string;
  threadId: string;
  createdAt: string;
  summary: string;
  tasks: ExtractedTaskItem[];
  markdown: string;
};

export type ExtractedTasksSummary = {
  id: string;
  subject: string;
  counterpart: string;
  threadId: string;
  createdAt: string;
  taskCount: number;
  filename: string;
};
