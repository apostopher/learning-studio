import { Resend } from "resend";
import { env } from "../../env";

if (!env.RESEND_API_KEY) {
  throw new Error(
    "RESEND_API_KEY is not set. Set it in .env or use development mode (NODE_ENV=development) to skip email sending.",
  );
}

export const resend = new Resend(env.RESEND_API_KEY);
