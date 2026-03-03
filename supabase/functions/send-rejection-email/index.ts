import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RejectionEmailPayload {
  recipientEmail: string;
  recipientName: string;
  rejectedByEmail: string;
  rejectedByName: string;
  pipelineName?: string;
  stageName?: string;
  buildNumber?: string;
  branch?: string;
  buildJobName?: string;
  rejectionReason?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const resend = new Resend(resendApiKey);
    const payload: RejectionEmailPayload = await req.json();

    const {
      recipientEmail,
      recipientName,
      rejectedByEmail,
      rejectedByName,
      pipelineName,
      stageName,
      buildNumber,
      branch,
      buildJobName,
      rejectionReason,
    } = payload;

    if (!recipientEmail) {
      throw new Error("recipientEmail is required");
    }

    const displayName = recipientName || recipientEmail.split("@")[0];
    const rejectorDisplay = rejectedByName || rejectedByEmail || "A team member";
    const pipelineDisplay = pipelineName || "Unknown Pipeline";
    const stageDisplay = stageName || "Manual Approval";
    const buildDisplay = buildNumber || "N/A";
    const branchDisplay = branch || "N/A";
    const jobDisplay = buildJobName || "Build Job";
    const rejectedAt = new Date().toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #dc2626, #ef4444); padding: 32px; text-align: center;">
              <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                <span style="font-size: 24px;">✕</span>
              </div>
              <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">
                Approval Request Rejected
              </h1>
              <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">
                Your pipeline execution has been stopped
              </p>
            </div>
            
            <!-- Content -->
            <div style="padding: 32px;">
              <p style="margin: 0 0 20px; font-size: 15px;">
                Hi ${displayName},
              </p>
              
              <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-weight: 600; color: #dc2626; font-size: 14px;">
                  Your approval request for stage "${stageDisplay}" was rejected by ${rejectorDisplay}.
                </p>
              </div>

              ${rejectionReason ? `
              <div style="background: #fff7ed; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #92400e; font-weight: 600;">Reason for Rejection</p>
                <p style="margin: 0; font-size: 14px; color: #334155; white-space: pre-wrap; line-height: 1.5;">${rejectionReason}</p>
              </div>
              ` : ''}
              
              <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">
                The pipeline execution has been terminated. Here are the details:
              </p>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 130px; font-size: 13px;">Build Job</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; font-size: 13px;">${jobDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Pipeline</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; font-size: 13px;">${pipelineDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Stage</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; font-size: 13px;">${stageDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Build #</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; font-size: 13px;">${buildDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Branch</td>
                  <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500; font-size: 13px;">${branchDisplay}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 12px; color: #64748b; font-size: 13px;">Rejected By</td>
                  <td style="padding: 10px 12px; font-weight: 500; font-size: 13px; color: #dc2626;">${rejectorDisplay}</td>
                </tr>
              </table>

              <div style="background: #f1f5f9; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; color: #64748b;">
                  <strong>Rejected at:</strong> ${rejectedAt}
                </p>
              </div>
              
              <p style="margin: 0; font-size: 14px; color: #475569;">
                If you believe this was done in error, please reach out to ${rejectorDisplay} or re-submit your pipeline execution for approval.
              </p>
            </div>
            
            <!-- Footer -->
            <div style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This is an automated notification from the DevOps Platform.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const { error: sendError } = await resend.emails.send({
      from: "DevOps Platform <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: `❌ Approval Rejected: ${stageDisplay} — ${pipelineDisplay}`,
      html: emailHtml,
    });

    if (sendError) {
      console.error("Resend error:", sendError);
      throw new Error(`Failed to send email: ${JSON.stringify(sendError)}`);
    }

    console.log(`Rejection email sent to ${recipientEmail}`);

    return new Response(
      JSON.stringify({ success: true, message: `Rejection email sent to ${recipientEmail}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Error sending rejection email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
};

serve(handler);
