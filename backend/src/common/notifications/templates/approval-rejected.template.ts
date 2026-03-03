/**
 * HTML email template for pipeline approval rejection notifications.
 *
 * Sent to the original requester when an approver rejects their
 * pipeline approval request, informing them the execution has been stopped.
 */

export interface ApprovalRejectedEmailParams {
  requesterEmail: string;
  requesterName?: string;
  rejectorEmail: string;
  rejectorName?: string;
  pipelineName: string;
  stageName: string;
  buildNumber?: string;
  branch?: string;
  buildJobName?: string;
  rejectionReason?: string;
  loginUrl: string;
  platformName?: string;
  supportEmail?: string;
}

export function renderApprovalRejectedEmail(params: ApprovalRejectedEmailParams): {
  subject: string;
  htmlBody: string;
  textBody: string;
} {
  const {
    requesterEmail,
    requesterName,
    rejectorEmail,
    rejectorName,
    pipelineName,
    stageName,
    buildNumber = 'N/A',
    branch = 'main',
    buildJobName,
    rejectionReason,
    loginUrl,
    platformName = 'License Portal',
    supportEmail = 'support@example.com',
  } = params;

  const displayName = requesterName || requesterEmail.split('@')[0];
  const rejectorDisplay = rejectorName || rejectorEmail.split('@')[0];
  const jobDisplay = buildJobName || pipelineName;

  const subject = `${platformName} — Approval Rejected: ${pipelineName} / ${stageName}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Approval Rejected</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0f1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: linear-gradient(135deg, #1a1d2e 0%, #141722 100%); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 28px 32px; text-align: center; }
    .header h1 { color: #fff; font-size: 20px; font-weight: 700; margin: 0; }
    .header p { color: rgba(255,255,255,0.85); font-size: 13px; margin: 8px 0 0; }
    .body { padding: 32px; }
    .greeting { color: #e2e8f0; font-size: 15px; margin: 0 0 16px; }
    .alert-box { background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.2); border-radius: 10px; padding: 14px 20px; margin: 16px 0; }
    .alert-box p { color: #fca5a5; font-size: 13px; font-weight: 600; margin: 0; }
    .detail-box { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 16px 20px; margin: 20px 0; }
    .message { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 16px 0; }
    .cta-wrapper { text-align: center; margin: 28px 0 12px; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { text-align: center; padding: 20px 32px 28px; }
    .footer p { color: #475569; font-size: 11px; margin: 4px 0; }
    .footer a { color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>✕ Approval Rejected</h1>
        <p>Your pipeline execution has been stopped</p>
      </div>
      <div class="body">
        <p class="greeting">Hi ${displayName},</p>
        <div class="alert-box">
          <p>Your approval request for stage "${stageName}" was rejected by ${rejectorDisplay}.</p>
        </div>
        <p class="message">The pipeline execution has been terminated. Here are the details:</p>
        <div class="detail-box">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0;">Build Job</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0;">${jobDisplay}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Pipeline</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${pipelineName}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Stage</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${stageName}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Build #</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${buildNumber}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Branch</td>
              <td style="color: #e2e8f0; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${branch}</td>
            </tr>
            <tr>
              <td style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">Rejected By</td>
              <td style="color: #fca5a5; font-size: 13px; font-weight: 600; text-align: right; padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.04);">${rejectorDisplay}</td>
            </tr>
          </table>
        </div>
        ${rejectionReason ? `
        <div style="background: rgba(220,38,38,0.06); border: 1px solid rgba(220,38,38,0.15); border-radius: 10px; padding: 16px 20px; margin: 16px 0;">
          <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Reason for Rejection</p>
          <p style="color: #e2e8f0; font-size: 13px; line-height: 1.5; margin: 0; white-space: pre-wrap;">${rejectionReason}</p>
        </div>
        ` : ''}
        <div class="cta-wrapper">
          <a href="${loginUrl}" class="cta-btn">View Details</a>
        </div>
        <p class="message" style="font-size: 12px; text-align: center;">
          If you believe this was done in error, please reach out to ${rejectorDisplay} or re-submit your pipeline.
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
APPROVAL REJECTED — ${platformName}

Hi ${displayName},

Your approval request for stage "${stageName}" was rejected by ${rejectorDisplay}.

Build Job: ${jobDisplay}
Pipeline: ${pipelineName}
Stage: ${stageName}
Build #: ${buildNumber}
Branch: ${branch}
Rejected By: ${rejectorDisplay}
${rejectionReason ? `\nReason: ${rejectionReason}\n` : ''}
The pipeline execution has been terminated.

If you believe this was done in error, please reach out to ${rejectorDisplay} or re-submit your pipeline.

View details: ${loginUrl}

---
This is an automated notification from ${platformName}.
Questions? Contact ${supportEmail}
`.trim();

  return { subject, htmlBody, textBody };
}
