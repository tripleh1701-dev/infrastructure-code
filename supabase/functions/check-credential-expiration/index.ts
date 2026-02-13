import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const VERSION = "v1.0.1";
console.log(`[${VERSION}] check-credential-expiration function loaded at ${new Date().toISOString()}`);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Credential {
  id: string;
  name: string;
  connector: string;
  category: string;
  auth_type: string;
  expires_at: string;
  expiry_notice_days: number;
  expiry_notify: boolean;
  account_id: string;
  enterprise_id: string;
  workstream_id: string;
  accounts: { id: string; name: string } | null;
  enterprises: { id: string; name: string } | null;
  workstreams: { id: string; name: string } | null;
}

interface NotificationLog {
  credential_id: string;
  account_id: string;
  recipient_email: string;
  recipient_name: string;
  notification_type: string;
  subject: string;
  days_until_expiry: number;
  status: "sent" | "failed";
  error_message?: string;
}

async function sendEmailViaResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Credential Alerts <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.message || `HTTP ${response.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function generateEmailHtml(
  recipientName: string,
  credential: Credential,
  daysUntilExpiry: number,
  accountName: string,
  enterpriseName: string,
  workstreamName: string
): string {
  const urgencyColor =
    daysUntilExpiry <= 7
      ? "#dc2626"
      : daysUntilExpiry <= 14
      ? "#f59e0b"
      : "#0171EC";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <div style="background: linear-gradient(135deg, ${urgencyColor}, ${urgencyColor}dd); padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">
              Credential Expiration Alert
            </h1>
          </div>
          <div style="padding: 32px;">
            <p style="margin: 0 0 24px;">Dear ${recipientName},</p>
            <div style="background: ${urgencyColor}10; border-left: 4px solid ${urgencyColor}; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; font-weight: 600; color: ${urgencyColor};">
                ${daysUntilExpiry === 1 ? "This credential expires TOMORROW!" : `This credential expires in ${daysUntilExpiry} days`}
              </p>
            </div>
            <p style="margin: 0 0 24px;">The following credential requires rotation before expiration:</p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 140px;">Credential</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${credential.name}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Connector</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${credential.connector}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Category</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${credential.category}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Account</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${accountName}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Enterprise</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${enterpriseName}</td></tr>
              <tr><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Workstream</td><td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${workstreamName}</td></tr>
              <tr><td style="padding: 12px; color: #64748b;">Expiry Date</td><td style="padding: 12px; font-weight: 600; color: ${urgencyColor};">${new Date(credential.expires_at).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</td></tr>
            </table>
            <p style="margin: 0 0 24px;">Please rotate this credential before it expires to avoid service interruptions.</p>
            <p style="margin: 0; color: #64748b; font-size: 14px;">If you have any questions, please contact your administrator.</p>
          </div>
          <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated notification. You received this email because expiry notifications are enabled for this credential.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

Deno.serve(async (req: Request): Promise<Response> => {
  console.log(`[${VERSION}] Request received: ${req.method}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[${VERSION}] Fetching credentials with expiry notifications enabled...`);

    const { data: credentials, error: fetchError } = await supabase
      .from("credentials")
      .select(`
        id, name, connector, category, auth_type, expires_at,
        expiry_notice_days, expiry_notify, account_id, enterprise_id, workstream_id,
        accounts (id, name),
        enterprises (id, name),
        workstreams (id, name)
      `)
      .eq("expiry_notify", true)
      .not("expires_at", "is", null);

    if (fetchError) {
      console.error(`[${VERSION}] Error fetching credentials:`, fetchError);
      throw fetchError;
    }

    console.log(`[${VERSION}] Found ${credentials?.length || 0} credentials`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const emailsSent: string[] = [];
    const errors: string[] = [];
    const notificationLogs: NotificationLog[] = [];

    for (const credential of (credentials as unknown as Credential[]) || []) {
      const expiryDate = new Date(credential.expires_at);
      expiryDate.setHours(0, 0, 0, 0);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      console.log(`[${VERSION}] Credential ${credential.name}: ${daysUntilExpiry} days until expiry`);

      if (daysUntilExpiry > 0 && daysUntilExpiry <= credential.expiry_notice_days) {
        const { data: adminUsers, error: usersError } = await supabase
          .from("account_technical_users")
          .select("email, first_name, last_name")
          .eq("account_id", credential.account_id)
          .eq("status", "active")
          .in("assigned_role", ["Admin", "admin", "Super Admin", "super_admin"]);

        if (usersError) {
          console.error(`[${VERSION}] Error fetching admin users:`, usersError);
          continue;
        }

        if (!adminUsers || adminUsers.length === 0) {
          console.log(`[${VERSION}] No admin users found for account ${credential.account_id}`);
          continue;
        }

        const accountName = credential.accounts?.name || "Unknown Account";
        const enterpriseName = credential.enterprises?.name || "Unknown Enterprise";
        const workstreamName = credential.workstreams?.name || "Unknown Workstream";

        for (const user of adminUsers) {
          const recipientName = `${user.first_name} ${user.last_name}`;
          const emailSubject = `⚠️ Credential Expiring: ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"} remaining - ${credential.name}`;
          const emailHtml = generateEmailHtml(recipientName, credential, daysUntilExpiry, accountName, enterpriseName, workstreamName);

          console.log(`[${VERSION}] Sending email to ${user.email}`);

          const { success, error: emailError } = await sendEmailViaResend(resendApiKey, user.email, emailSubject, emailHtml);

          if (!success) {
            console.error(`[${VERSION}] Failed to send email to ${user.email}:`, emailError);
            errors.push(`${user.email}: ${emailError}`);
            notificationLogs.push({
              credential_id: credential.id,
              account_id: credential.account_id,
              recipient_email: user.email,
              recipient_name: recipientName,
              notification_type: "credential_expiry_reminder",
              subject: emailSubject,
              days_until_expiry: daysUntilExpiry,
              status: "failed",
              error_message: emailError,
            });
          } else {
            console.log(`[${VERSION}] Email sent successfully to ${user.email}`);
            emailsSent.push(user.email);
            notificationLogs.push({
              credential_id: credential.id,
              account_id: credential.account_id,
              recipient_email: user.email,
              recipient_name: recipientName,
              notification_type: "credential_expiry_reminder",
              subject: emailSubject,
              days_until_expiry: daysUntilExpiry,
              status: "sent",
            });
          }
        }
      }
    }

    if (notificationLogs.length > 0) {
      const { error: logError } = await supabase
        .from("credential_notification_history")
        .insert(notificationLogs);

      if (logError) {
        console.error(`[${VERSION}] Error logging notifications:`, logError);
      } else {
        console.log(`[${VERSION}] Logged ${notificationLogs.length} notifications`);
      }
    }

    const response = {
      success: true,
      version: VERSION,
      message: `Processed ${credentials?.length || 0} credentials`,
      emailsSent: emailsSent.length,
      recipients: emailsSent,
      logged: notificationLogs.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`[${VERSION}] Completed:`, response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[${VERSION}] Error:`, error);
    return new Response(
      JSON.stringify({ success: false, version: VERSION, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
