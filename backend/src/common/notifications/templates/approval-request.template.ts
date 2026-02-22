/**
 * HTML email template for pipeline approval request notifications.
 *
 * Sent to designated approvers when a pipeline execution reaches
 * an approval gate, prompting them to log in and approve/reject.
 */

export interface ApprovalRequestEmailParams {
  approverEmail: string;
  requesterEmail: string;
  pipelineName: string;
  stageName: string;
  branch?: string;
  buildJobId?: string;
  executionId?: string;
  loginUrl: string;
  platformName?: string;
  supportEmail?: string;
}

export function renderApprovalRequestEmail(params: ApprovalRequestEmailParams): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const {
    approverEmail,
    requesterEmail,
    pipelineName,
    stageName,
    branch = 'main',
    loginUrl,
    platformName = 'License Portal',
    supportEmail = 'support@example.com',
  } = params;

  const subject = `${platformName} — Approval Required: ${pipelineName} / ${stageName}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Approval Required</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0f1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: linear-gradient(135deg, #1a1d2e 0%, #141722 100%); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 700; margin: 0; }
    .header p { color: rgba(255,255,255,0.85); font-size: 13px; margin: 8px 0 0; }
    .body { padding: 32px; }
    .greeting { color: #e2e8f0; font-size: 15px; margin: 0 0 16px; }
    .detail-box { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px 20px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
    .detail-row:last-child { border-bottom: none; }
    .detail-label { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .detail-value { color: #e2e8f0; font-size: 13px; font-weight: 600; }
    .message { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 16px 0; }
    .cta-wrapper { text-align: center; margin: 28px 0 12px; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; padding: 20px 32px 28px; }
    .footer p { color: #475569; font-size: 11px; margin: 4px 0; }
    .footer a { color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>⏳ Approval Required</h1>
        <p>A pipeline execution is waiting for your sign-off</p>
      </div>
      <div class="body">
        <p class="greeting">Hello,</p>
        <p class="message">
          <strong>${requesterEmail}</strong> has requested your approval for a pipeline stage.
          The execution is paused and will not proceed until you approve or reject.
        </p>
        <div class="detail-box">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0;">Pipeline</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0;">${pipelineName}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Stage</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${stageName}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Branch</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${branch}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Requested By</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${requesterEmail}</td>
            </tr>
          </table>
        </div>
        <div class="cta-wrapper">
          <a href="${loginUrl}" class="cta-btn">Review &amp; Approve</a>
        </div>
        <p class="message" style="font-size: 12px; text-align: center;">
          Log in to your inbox to approve or reject this request.
        </p>
      </div>
      <div class="footer">
        <p>This is an automated notification from ${platformName}.</p>
        <p>Questions? Contact <a href="mailto:${supportEmail}">${supportEmail}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const textBody = `
APPROVAL REQUIRED — ${platformName}

Hello,

${requesterEmail} has requested your approval for a pipeline stage.

Pipeline: ${pipelineName}
Stage: ${stageName}
Branch: ${branch}
Requested By: ${requesterEmail}

The execution is paused and will not proceed until you approve or reject.

Log in to review: ${loginUrl}

---
This is an automated notification from ${platformName}.
Questions? Contact ${supportEmail}
`.trim();

  return { subject, htmlBody, textBody };
}
