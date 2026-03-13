import type { Request, Response, NextFunction } from "express";
import { z, type ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export const createProjectSchema = z.object({
  gitURL: z
    .string()
    .url("Must be a valid URL")
    .regex(
      /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/,
      "Must be a valid public GitHub repository URL (https://github.com/owner/repo)"
    ),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens")
    .min(3)
    .max(48)
    .optional(),
});
