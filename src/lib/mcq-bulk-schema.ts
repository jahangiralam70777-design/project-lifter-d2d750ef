import { z } from "zod";

const optionStr = z.string().trim().min(1).max(1000);
const optionStrNullable = z.string().trim().max(1000).nullable().optional();

export const mcqDifficultyEnum = z.enum(["easy", "medium", "hard"]);
export const mcqStatusEnum = z.enum(["draft", "published", "archived"]);
export const mcqOptionEnum = z.enum(["A", "B", "C", "D"]);
export const mcqQuestionTypeEnum = z.enum(["mcq", "true_false"]);

export const mcqBulkImportItemSchema = z
  .object({
    question: z.string().trim().min(3).max(4000),
    question_type: mcqQuestionTypeEnum.default("mcq"),
    option_a: optionStr,
    option_b: optionStr,
    option_c: optionStrNullable,
    option_d: optionStrNullable,
    correct_option: mcqOptionEnum,
    explanation: z.string().trim().max(4000).nullable().optional(),
    difficulty: mcqDifficultyEnum.default("medium"),
    status: mcqStatusEnum.default("published"),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    sourceIndex: z.number().int().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.question_type === "true_false") {
      if (!["A", "B"].includes(v.correct_option)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "True/False correct_option must be A or B",
        });
      }
    } else if (!v.option_c || !v.option_c.trim() || !v.option_d || !v.option_d.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ requires all four options" });
    }
  });

export type McqBulkImportItem = z.infer<typeof mcqBulkImportItemSchema>;
