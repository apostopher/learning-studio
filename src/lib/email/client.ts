import { Resend } from 'resend';
import { env } from '../../env';

let _resend: Resend | null = null;

export function getResendClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      'RESEND_API_KEY is not set. Set it in .env or use development mode (NODE_ENV=development) to skip email sending.',
    );
  }
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}
