/**
 * HTML email template for credential provisioning notification.
 *
 * Sent to technical users when their Cognito identity is created,
 * delivering their login URL, email, and temporary password.
 *
 * Security notes:
 *  - The temporary password is set as a permanent password in Cognito
 *    (no forced change on first login), but the email instructs the
 *    user to change it immediately.
 *  - This email must be sent over TLS (SES enforces this).
 */

export interface CredentialEmailParams {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  accountName?: string;
  platformName?: string;
  supportEmail?: string;
}

export function renderCredentialProvisionedEmail(params: CredentialEmailParams): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const {
    firstName,
    lastName,
    email,
    temporaryPassword,
    loginUrl,
    accountName = 'your organization',
    platformName = 'License Portal',
    supportEmail = 'support@example.com',
  } = params;

  const subject = `${platformName} — Your login credentials are ready`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Credentials</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 32px; }
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 { margin: 0; font-size: 22px; color: #1a1a2e; }
    .greeting { font-size: 15px; color: #333; line-height: 1.6; }
    .credentials-box { background: #f8f9fb; border: 1px solid #e2e6ed; border-radius: 6px; padding: 20px; margin: 20px 0; }
    .credentials-box table { width: 100%; border-collapse: collapse; }
    .credentials-box td { padding: 6px 0; font-size: 14px; color: #333; }
    .credentials-box td.label { font-weight: 600; width: 130px; color: #555; }
    .credentials-box td.value { font-family: 'Courier New', Courier, monospace; word-break: break-all; }
    .password-value { background: #fff3cd; padding: 4px 8px; border-radius: 4px; border: 1px dashed #d4a017; display: inline-block; }
    .cta { text-align: center; margin: 24px 0; }
    .cta a { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 15px; font-weight: 600; }
    .security-notice { background: #fef3cd; border-left: 4px solid #d4a017; padding: 12px 16px; margin: 20px 0; font-size: 13px; color: #856404; border-radius: 0 4px 4px 0; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #888; line-height: 1.5; }
    .footer a { color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>Welcome to ${platformName}</h1>
      </div>

      <div class="greeting">
        <p>Hello ${firstName} ${lastName},</p>
        <p>
          Your account for <strong>${accountName}</strong> has been provisioned.
          You can now log in using the credentials below.
        </p>
      </div>

      <div class="credentials-box">
        <table>
          <tr>
            <td class="label">Login URL</td>
            <td class="value"><a href="${loginUrl}" style="color:#2563eb;">${loginUrl}</a></td>
          </tr>
          <tr>
            <td class="label">Email</td>
            <td class="value">${email}</td>
          </tr>
          <tr>
            <td class="label">Password</td>
            <td class="value"><span class="password-value">${temporaryPassword}</span></td>
          </tr>
        </table>
      </div>

      <div class="cta">
        <a href="${loginUrl}">Sign In Now</a>
      </div>

      <div class="security-notice">
        ⚠️ <strong>Security notice:</strong> Please change your password immediately
        after your first login. Do not share these credentials with anyone.
        This email contains sensitive information — delete it after saving
        your credentials in a secure password manager.
      </div>

      <div class="greeting" style="margin-top:16px;">
        <p>If you did not expect this email, please contact
          <a href="mailto:${supportEmail}" style="color:#2563eb;">${supportEmail}</a>.
        </p>
      </div>
    </div>

    <div class="footer">
      <p>This is an automated message from ${platformName}.<br />
        Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`.trim();

  const textBody = [
    `Welcome to ${platformName}`,
    '',
    `Hello ${firstName} ${lastName},`,
    '',
    `Your account for ${accountName} has been provisioned.`,
    `You can now log in using the credentials below.`,
    '',
    `Login URL: ${loginUrl}`,
    `Email:     ${email}`,
    `Password:  ${temporaryPassword}`,
    '',
    `⚠️  SECURITY NOTICE`,
    `Please change your password immediately after your first login.`,
    `Do not share these credentials with anyone.`,
    `Delete this email after saving your credentials in a secure password manager.`,
    '',
    `If you did not expect this email, please contact ${supportEmail}.`,
    '',
    `This is an automated message from ${platformName}.`,
  ].join('\n');

  return { subject, htmlBody, textBody };
}
