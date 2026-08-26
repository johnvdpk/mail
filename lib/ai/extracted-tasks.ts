import { promises as fs } from "node:fs";
import path from "node:path";
import { dataPath } from "../config/paths";
import type {
  ExtractedTaskItem,
  ExtractedTasksDoc,
  ExtractedTasksSummary,
} from "./extracted-tasks-types";

export type { ExtractedTaskItem, ExtractedTasksDoc, ExtractedTasksSummary };

function tasksDir(): string {
  return dataPath("extracted-tasks");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "taken";
}

function metaPath(id: string): string {
  return path.join(tasksDir(), `${id}.json`);
}

function mdPath(id: string, subject: string): string {
  return path.join(tasksDir(), `${id}-${slugify(subject)}.md`);
}

/** Build a coding-friendly markdown checklist from extracted tasks. */
export function buildTasksMarkdown(input: {
  subject: string;
  counterpart: string;
  createdAt: string;
  summary: string;
  tasks: ExtractedTaskItem[];
}): string {
  const lines: string[] = [];
  lines.push(`# Taken: ${input.subject}`);
  lines.push("");
  lines.push(`- Van: ${input.counterpart}`);
  lines.push(`- Datum: ${new Date(input.createdAt).toLocaleString("nl-NL")}`);
  lines.push(`- Bron: e-mail`);
  lines.push("");

  if (input.summary.trim()) {
    lines.push("## Context");
    lines.push("");
    lines.push(input.summary.trim());
    lines.push("");
  }

  lines.push("## Taken");
  lines.push("");
  for (const task of input.tasks) {
    const mark = task.done ? "x" : " ";
    lines.push(`- [${mark}] ${task.title}`);
    if (task.notes?.trim()) {
      lines.push(`  - ${task.notes.trim()}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(tasksDir(), { recursive: true });
}

export async function saveExtractedTasks(input: {
  subject: string;
  counterpart: string;
  threadId: string;
  summary: string;
  tasks: ExtractedTaskItem[];
}): Promise<ExtractedTasksDoc> {
  await ensureDir();
  const createdAt = new Date().toISOString();
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const markdown = buildTasksMarkdown({
    subject: input.subject,
    counterpart: input.counterpart,
    createdAt,
    summary: input.summary,
    tasks: input.tasks,
  });

  const doc: ExtractedTasksDoc = {
    id,
    subject: input.subject,
    counterpart: input.counterpart,
    threadId: input.threadId,
    createdAt,
    summary: input.summary,
    tasks: input.tasks,
    markdown,
  };

  await fs.writeFile(metaPath(id), JSON.stringify(doc, null, 2), "utf8");
  await fs.writeFile(mdPath(id, input.subject), markdown, "utf8");
  return doc;
}

export async function listExtractedTasks(): Promise<ExtractedTasksSummary[]> {
  await ensureDir();
  const entries = await fs.readdir(tasksDir());
  const docs: ExtractedTasksSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(tasksDir(), entry), "utf8");
      const doc = JSON.parse(raw) as ExtractedTasksDoc;
      if (!doc?.id) continue;
      docs.push({
        id: doc.id,
        subject: doc.subject,
        counterpart: doc.counterpart,
        threadId: doc.threadId,
        createdAt: doc.createdAt,
        taskCount: Array.isArray(doc.tasks) ? doc.tasks.length : 0,
        filename: `${doc.id}-${slugify(doc.subject)}.md`,
      });
    } catch {
      // Skip corrupt files
    }
  }

  return docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getExtractedTasks(id: string): Promise<ExtractedTasksDoc | null> {
  try {
    const raw = await fs.readFile(metaPath(id), "utf8");
    return JSON.parse(raw) as ExtractedTasksDoc;
  } catch {
    return null;
  }
}

export async function deleteExtractedTasks(id: string): Promise<boolean> {
  const doc = await getExtractedTasks(id);
  if (!doc) return false;

  await fs.unlink(metaPath(id)).catch(() => undefined);
  await fs.unlink(mdPath(id, doc.subject)).catch(() => undefined);
  return true;
}
