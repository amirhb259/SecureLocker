import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .regex(/[a-z]/, "Use at least one lowercase letter.")
  .regex(/[A-Z]/, "Use at least one uppercase letter.")
  .regex(/\d/, "Use at least one number.")
  .regex(/[^a-zA-Z0-9]/, "Use at least one symbol.");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: passwordSchema,
  username: z
    .string()
    .trim()
    .min(5, "Username must be at least 5 characters")
    .max(32)
    .superRefine((username, ctx) => {
      if (/^[a-z]/.test(username)) {
        ctx.addIssue({
          code: "custom",
          message: "Username must start with a capital letter",
        });
        return;
      }

      if (!/^[A-Z]/.test(username)) {
        ctx.addIssue({
          code: "custom",
          message: "Username cannot start with a number or symbol",
        });
        return;
      }

      if (!/^[A-Za-z0-9]+$/.test(username)) {
        ctx.addIssue({
          code: "custom",
          message: "Username can only contain letters and numbers",
        });
      }
    }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1),
  rememberDevice: z.boolean().default(false),
});

export const emailSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  token: z.string().min(32),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const passwordConfirmationSchema = z.object({
  password: z.string().min(1),
});

const encryptedBlobSchema = z.string().min(16).max(200_000);
const nonceSchema = z.string().min(12).max(64);

export const vaultSetupSchema = z.object({
  dataKeyNonce: nonceSchema,
  encryptedDataKey: encryptedBlobSchema,
  kdfIterations: z.number().int().min(100_000).max(2_000_000),
  kdfSalt: z.string().min(16).max(128),
  recoveryDataKeyNonce: nonceSchema,
  recoveryEncryptedDataKey: encryptedBlobSchema,
});

export const vaultEnvelopeSchema = vaultSetupSchema.omit({ kdfIterations: true, kdfSalt: true });

export const vaultCredentialSchema = z.object({
  ciphertext: encryptedBlobSchema,
  nonce: nonceSchema,
});

export const vaultActivitySchema = z.object({
  action: z.enum(["copied", "revealed", "locked", "unlocked"]),
  credentialId: z.string().uuid().optional(),
});

const securityAnswerSchema = z.string().trim().min(2).max(160);

export const securityQuestionSetupSchema = z.object({
  answers: z
    .array(
      z.object({
        answer: securityAnswerSchema,
        questionId: z.string().uuid(),
      }),
    )
    .length(3)
    .refine((answers) => new Set(answers.map((item) => item.questionId)).size === 3, {
      message: "Choose three different questions.",
    }),
  token: z.string().min(32),
});

export const recoveryStartSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

export const recoveryChallengeSchema = z.object({
  token: z.string().min(32),
});

export const recoveryCompleteSchema = z.object({
  answers: z.array(securityAnswerSchema).length(3),
  token: z.string().min(32),
});
