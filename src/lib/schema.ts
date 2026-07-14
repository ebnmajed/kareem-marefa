import { z } from "zod";

export const TOPIC_CATEGORIES = [
  "technical",
  "management",
  "creative",
  "experience",
] as const;

export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];
export type Role = "provider" | "attendee";

/** Honeypot field name — lives here (not anti-spam.ts) so the client form
 * can import it without pulling node:crypto into the browser bundle.
 * Deliberately meaningless so autofill heuristics never match it. */
export const HONEYPOT_FIELD = "field_xk2";

const base = {
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  locale: z.enum(["ar", "en"]),
};

/** Canonical shape — mirrors the DB check constraints exactly. */
export const registrationSchema = z.discriminatedUnion("role", [
  z.object({ ...base, role: z.literal("attendee") }),
  z.object({
    ...base,
    role: z.literal("provider"),
    topicTitle: z.string().trim().min(3).max(150),
    topicDescription: z.string().trim().max(600).default(""),
    topicCategory: z.enum(TOPIC_CATEGORIES),
  }),
]);

export type RegistrationInput = z.infer<typeof registrationSchema>;

export type RegistrationField =
  | "role"
  | "name"
  | "email"
  | "topicTitle"
  | "topicCategory"
  | "topicDescription";

/** Values are message keys under the `register.errors` namespace. */
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export type RawRegistrationValues = {
  role?: string;
  name?: string;
  email?: string;
  topicTitle?: string;
  topicDescription?: string;
  topicCategory?: string;
  locale?: string;
};

const emailSchema = z.email();

/**
 * Field-by-field validation with deterministic error-key mapping, shared by
 * the client's on-blur checks and the server action (which is authoritative).
 * Provider fields are only considered when role === 'provider'.
 */
export function validateRegistration(raw: RawRegistrationValues): {
  data?: RegistrationInput;
  errors: RegistrationErrors;
} {
  const errors: RegistrationErrors = {};

  const role = raw.role;
  if (role !== "provider" && role !== "attendee") {
    errors.role = "roleMissing";
  }

  // Code-point count, matching Postgres char_length (JS .length counts
  // UTF-16 units, so an astral character would pass .length >= 2 yet
  // violate the DB check).
  const name = (raw.name ?? "").trim();
  const nameLen = [...name].length;
  if (nameLen < 2 || nameLen > 100) errors.name = "nameRequired";

  const email = (raw.email ?? "").trim().toLowerCase();
  if (!email) {
    errors.email = "emailRequired";
  } else if (email.length > 254 || !emailSchema.safeParse(email).success) {
    errors.email = "emailInvalid";
  }

  if (role === "provider") {
    const title = (raw.topicTitle ?? "").trim();
    if (title.length < 3 || title.length > 150) {
      errors.topicTitle = "topicTitleRequired";
    }
    if (!TOPIC_CATEGORIES.includes(raw.topicCategory as TopicCategory)) {
      errors.topicCategory = "categoryRequired";
    }
    if ((raw.topicDescription ?? "").trim().length > 600) {
      errors.topicDescription = "descriptionTooLong";
    }
  }

  if (Object.keys(errors).length > 0) return { errors };

  const locale = raw.locale === "en" ? "en" : "ar";
  const parsed = registrationSchema.safeParse(
    role === "provider"
      ? {
          role,
          name,
          email,
          locale,
          topicTitle: raw.topicTitle,
          topicDescription: raw.topicDescription ?? "",
          topicCategory: raw.topicCategory,
        }
      : { role, name, email, locale },
  );

  if (!parsed.success) {
    // Field checks above should have caught everything; this is the backstop.
    return { errors: { role: "roleMissing" } };
  }

  return { data: parsed.data, errors: {} };
}
