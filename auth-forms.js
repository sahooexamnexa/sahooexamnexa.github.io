// Presentation validation only. Supabase Auth owns credentials, codes and rate limits.
export const resendCooldownSeconds = 60;
export const confirmationMessage = 'Check your email to confirm registration. Use the latest verification code or the confirmation link. If you already have an account, log in or reset your password.';
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function validateAuthFields(mode, values = {}) {
  const errors = {};
  if (!validEmail(normalizeEmail(values.email))) errors.email = 'Enter a valid email address.';
  if (typeof values.password !== 'string' || !values.password.length) errors.password = 'Enter your password.';
  if (mode === 'register') {
    const name = typeof values.displayName === 'string' ? values.displayName.trim() : '';
    if (!name || [...name].length > 120 || /[\u0000-\u001f\u007f]/u.test(name)) errors.displayName = 'Enter your full name, using up to 120 characters.';
    if (typeof values.password !== 'string' || values.password.length < 8) errors.password = 'Use at least 8 characters for your new password.';
    if (typeof values.confirmPassword !== 'string' || !values.confirmPassword.length) errors.confirmPassword = 'Confirm your password.';
    else if (values.password !== values.confirmPassword) errors.confirmPassword = 'The passwords do not match.';
  }
  return errors;
}

export function validateEmailCode({email, token} = {}) {
  const errors = {};
  if (!validEmail(normalizeEmail(email))) errors.email = 'Enter the email address you registered with.';
  // Supabase supports configured email codes between 6 and 10 digits.
  if (typeof token !== 'string' || !/^[0-9]{6,10}$/.test(token.trim())) errors.token = 'Enter the 6–10 digit code from your latest email.';
  return errors;
}

export function authErrorMessage(error, context = 'login') {
  const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
  if (['over_email_send_rate_limit','over_request_rate_limit','rate_limit_exceeded'].includes(code) || error?.status === 429) return 'Too many requests. Wait before trying again, and check your latest email.';
  if (['otp_expired','otp_disabled','invalid_credentials'].includes(code) && context === 'verify') return 'The verification code is invalid or expired. Check your latest email or request a new code.';
  if (code === 'email_not_confirmed') return 'Your email still needs confirmation. Use your verification code or the link in your email.';
  if (['user_already_exists','email_exists'].includes(code)) return confirmationMessage;
  if (code === 'weak_password') return 'That password does not meet the account requirements. Please use a longer, stronger password.';
  if (['email_address_invalid','validation_failed'].includes(code)) return 'Check the email address and details, then try again.';
  if (code === 'signup_disabled') return 'Registration is temporarily unavailable. Existing students can still log in.';
  if (context === 'verify') return 'Email verification could not be completed. Check the latest code and your connection, then try again.';
  if (context === 'resend') return 'The confirmation email could not be sent. Wait before retrying, or use an existing confirmation link.';
  if (context === 'register') return 'Registration could not be completed or the confirmation email could not be sent. Please try again later, or log in if you already registered.';
  return 'Unable to log in. Check your email and password, email confirmation, and connection.';
}
