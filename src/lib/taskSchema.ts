import { z } from "zod";

// Personal Credit Task Schema based on JSON Schema specification
export const personalCreditTaskSchema = z.object({
  id: z.string().uuid().describe("UUID or unique slug"),
  title: z.string().min(3).max(120),
  category: z.enum(["Personal Credit", "Personal Finance"]),
  tags: z
    .array(
      z.enum([
        "#PersonalCredit",
        "#FCRA",
        "#FDCPA",
        "#ConsumerReports",
        "#CreditRepair",
        "#PersonalFinance",
        "#Budgeting",
        "#Savings",
        "#CreditEducation",
        "#Monitoring",
      ])
    )
    .min(1)
    .refine((tags) => new Set(tags).size === tags.length, {
      message: "Tags must be unique",
    }),
  priority: z.enum(["P0", "P1", "P2", "P3"]).describe("P0=urgent"),
  due_date: z.string().datetime(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]),
  estimated_minutes: z.number().int().min(5).optional(),
  dependencies: z.array(z.string()).optional(),
  checklist: z.array(z.string()).optional(),
  instructions: z.string().min(10),
  resources: z.array(z.string().describe("links or doc IDs")).optional(),
  metrics: z
    .object({
      target_utilization_pct: z.number().min(0).max(100).optional(),
      target_score_gain: z.number().int().min(0).optional(),
      target_savings_amount: z.number().min(0).optional(),
    })
    .strict()
    .optional(),
}).strict();

export type PersonalCreditTask = z.infer<typeof personalCreditTaskSchema>;

// Task metadata schema for database storage
export const taskMetadataSchema = z.object({
  tags: z.array(z.string()),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  estimated_minutes: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  checklist: z.array(z.string()).optional(),
  resources: z.array(z.string()).optional(),
  metrics: z
    .object({
      target_utilization_pct: z.number().optional(),
      target_score_gain: z.number().optional(),
      target_savings_amount: z.number().optional(),
    })
    .optional(),
  category: z.enum(["Personal Credit", "Personal Finance"]).optional(),
  instructions: z.string().optional(),
});

export type TaskMetadata = z.infer<typeof taskMetadataSchema>;

// Validation helper
export function validatePersonalCreditTask(task: unknown): {
  success: boolean;
  data?: PersonalCreditTask;
  error?: z.ZodError;
} {
  const result = personalCreditTaskSchema.safeParse(task);
  return {
    success: result.success,
    data: result.success ? result.data : undefined,
    error: result.success ? undefined : result.error,
  };
}

// Map database task status to schema status
export function mapDatabaseStatus(
  dbStatus: "pending" | "in_progress" | "completed" | "cancelled"
): "todo" | "in_progress" | "blocked" | "done" {
  switch (dbStatus) {
    case "pending":
      return "todo";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "done";
    case "cancelled":
      return "blocked";
    default:
      return "todo";
  }
}

// Map schema status to database status
export function mapSchemaStatus(
  schemaStatus: "todo" | "in_progress" | "blocked" | "done"
): "pending" | "in_progress" | "completed" | "cancelled" {
  switch (schemaStatus) {
    case "todo":
      return "pending";
    case "in_progress":
      return "in_progress";
    case "done":
      return "completed";
    case "blocked":
      return "cancelled";
    default:
      return "pending";
  }
}
