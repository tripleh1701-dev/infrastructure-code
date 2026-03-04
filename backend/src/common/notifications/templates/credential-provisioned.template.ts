/**
 * HTML email template for credential provisioning notification.
 *
 * Sent to technical users when their Cognito identity is created,
 * delivering their login URL, email, and temporary password.
 *
 * Design: Matches the branded Cognito verification email style
 * defined in infra/modules/cognito/main.tf — gradient header,
 * card layout, consistent typography, and Trumpet DevOps branding.
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
    platformName = 'Trumpet DevOps',
    supportEmail = 'support@example.com',
  } = params;

  const subject = `${platformName} — Your Login Credentials Are Ready`;

  const htmlBody = `<html>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;background-color:#f4f6f9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 0;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

<!-- Branded gradient header -->
<tr><td style="background:linear-gradient(135deg,#1a6ddb,#0db7c4);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${platformName}</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">CI/CD Platform</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:36px 40px;">

<h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;font-weight:600;">Your Login Credentials</h2>

<p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">
  Hello <strong>${firstName} ${lastName}</strong>,<br/>
  Your account for <strong>${accountName}</strong> has been provisioned successfully.
  Use the credentials below to sign in.
</p>

<!-- Credentials card -->
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fb;border:1px solid #e2e6ed;border-radius:8px;margin:0 0 24px;">
<tr><td style="padding:20px 24px;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#888;font-weight:600;width:100px;vertical-align:top;">EMAIL</td>
      <td style="padding:6px 0;font-size:14px;color:#1a1a2e;font-family:'Courier New',monospace;word-break:break-all;">${email}</td>
    </tr>
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#888;font-weight:600;width:100px;vertical-align:top;">PASSWORD</td>
      <td style="padding:6px 0;">
        <div style="display:inline-block;background-color:#f0f4ff;border:2px dashed #1a6ddb;border-radius:8px;padding:8px 16px;">
          <span style="font-size:18px;font-weight:700;letter-spacing:2px;color:#1a6ddb;font-family:'Courier New',monospace;">${temporaryPassword}</span>
        </div>
      </td>
    </tr>
  </table>
</td></tr>
</table>

<!-- CTA button -->
<div style="text-align:center;margin:0 0 24px;">
  <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#1a6ddb,#0db7c4);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.5px;">Sign In Now</a>
</div>

<!-- Security notice -->
<div style="background:#fff8e1;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:0 8px 8px 0;margin:0 0 20px;">
  <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
    <strong>⚠️ Security Notice:</strong> Please change your password immediately after your first login.
    Do not share these credentials with anyone. Delete this email after saving your password in a secure password manager.
  </p>
</div>

<p style="margin:0 0 8px;color:#555;font-size:14px;line-height:1.5;">
  If you did not expect this email, please contact
  <a href="mailto:${supportEmail}" style="color:#1a6ddb;text-decoration:none;">${supportEmail}</a>.
</p>

<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />

<p style="margin:0;color:#999;font-size:12px;line-height:1.5;">
  Need help? Contact our support team if you have any questions about your account setup.
</p>

</td></tr>

<!-- Footer -->
<tr><td style="background-color:#f8f9fb;padding:20px 40px;text-align:center;">
<p style="margin:0;color:#aaa;font-size:11px;">&copy; ${new Date().getFullYear()} ${platformName}. All rights reserved.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

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
