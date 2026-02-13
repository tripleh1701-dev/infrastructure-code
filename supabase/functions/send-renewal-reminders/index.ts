import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface License {
  id: string;
  end_date: string;
  number_of_users: number;
  contact_full_name: string;
  contact_email: string;
  notice_days: number;
  renewal_notify: boolean;
  account_id: string;
  accounts: { id: string; name: string } | null;
  enterprises: { id: string; name: string } | null;
  products: { id: string; name: string } | null;
  services: { id: string; name: string } | null;
}

interface NotificationLog {
  license_id: string;
  account_id: string;
  recipient_email: string;
  recipient_name: string;
  notification_type: string;
  subject: string;
  days_until_expiry: number;
  status: "sent" | "failed";
  error_message?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const resend = new Resend(resendApiKey);

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Fetching licenses with renewal notifications enabled...");

    // Get all licenses with renewal_notify enabled
    const { data: licenses, error: fetchError } = await supabase
      .from("account_licenses")
      .select(`
        id,
        account_id,
        end_date,
        number_of_users,
        contact_full_name,
        contact_email,
        notice_days,
        renewal_notify,
        accounts (id, name),
        enterprises (id, name),
        products (id, name),
        services (id, name)
      `)
      .eq("renewal_notify", true);

    if (fetchError) {
      console.error("Error fetching licenses:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${licenses?.length || 0} licenses with notifications enabled`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const emailsSent: string[] = [];
    const errors: string[] = [];
    const notificationLogs: NotificationLog[] = [];

    for (const license of (licenses as unknown as License[]) || []) {
      const endDate = new Date(license.end_date);
      endDate.setHours(0, 0, 0, 0);

      const daysUntilExpiry = Math.ceil(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      console.log(
        `License ${license.id}: ${daysUntilExpiry} days until expiry, notice_days: ${license.notice_days}`
      );

      // Check if we should send notification (within notice period and not expired)
      if (daysUntilExpiry > 0 && daysUntilExpiry <= license.notice_days) {
        console.log(`Sending renewal reminder to ${license.contact_email}`);

        const accountName = license.accounts?.name || "Unknown Account";
        const enterpriseName = license.enterprises?.name || "Unknown Enterprise";
        const productName = license.products?.name || "Unknown Product";
        const serviceName = license.services?.name || "Unknown Service";

        const emailSubject = `⚠️ License Renewal Reminder: ${daysUntilExpiry} day${
          daysUntilExpiry === 1 ? "" : "s"
        } remaining - ${productName}`;

        try {
          const urgencyClass =
            daysUntilExpiry <= 7
              ? "critical"
              : daysUntilExpiry <= 14
              ? "warning"
              : "notice";

          const urgencyColor =
            urgencyClass === "critical"
              ? "#dc2626"
              : urgencyClass === "warning"
              ? "#f59e0b"
              : "#0171EC";

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
                  <div style="background: linear-gradient(135deg, ${urgencyColor}, ${urgencyColor}dd); padding: 32px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 600;">
                      License Renewal Reminder
                    </h1>
                  </div>
                  
                  <!-- Content -->
                  <div style="padding: 32px;">
                    <p style="margin: 0 0 24px;">
                      Dear ${license.contact_full_name},
                    </p>
                    
                    <div style="background: ${urgencyColor}10; border-left: 4px solid ${urgencyColor}; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
                      <p style="margin: 0; font-weight: 600; color: ${urgencyColor};">
                        ${
                          daysUntilExpiry === 1
                            ? "Your license expires TOMORROW!"
                            : `Your license expires in ${daysUntilExpiry} days`
                        }
                      </p>
                    </div>
                    
                    <p style="margin: 0 0 24px;">
                      The following license is due for renewal:
                    </p>
                    
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b; width: 140px;">Account</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${accountName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Enterprise</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${enterpriseName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Product</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${productName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Service</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${serviceName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Users</td>
                        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${license.number_of_users}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px; color: #64748b;">Expiry Date</td>
                        <td style="padding: 12px; font-weight: 600; color: ${urgencyColor};">
                          ${new Date(license.end_date).toLocaleDateString("en-US", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 0 0 24px;">
                      Please take action to renew this license before it expires to avoid any service interruption.
                    </p>
                    
                    <p style="margin: 0; color: #64748b; font-size: 14px;">
                      If you have any questions, please contact your account administrator.
                    </p>
                  </div>
                  
                  <!-- Footer -->
                  <div style="background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                      This is an automated notification. You received this email because renewal notifications are enabled for this license.
                    </p>
                  </div>
                </div>
              </div>
            </body>
            </html>
          `;

          const { error: emailError } = await resend.emails.send({
            from: "License Renewal <onboarding@resend.dev>",
            to: [license.contact_email],
            subject: emailSubject,
            html: emailHtml,
          });

          if (emailError) {
            console.error(
              `Failed to send email to ${license.contact_email}:`,
              emailError
            );
            errors.push(`${license.contact_email}: ${emailError.message}`);
            
            // Log failed notification
            notificationLogs.push({
              license_id: license.id,
              account_id: license.account_id,
              recipient_email: license.contact_email,
              recipient_name: license.contact_full_name,
              notification_type: "renewal_reminder",
              subject: emailSubject,
              days_until_expiry: daysUntilExpiry,
              status: "failed",
              error_message: emailError.message,
            });
          } else {
            console.log(`Email sent successfully to ${license.contact_email}`);
            emailsSent.push(license.contact_email);
            
            // Log successful notification
            notificationLogs.push({
              license_id: license.id,
              account_id: license.account_id,
              recipient_email: license.contact_email,
              recipient_name: license.contact_full_name,
              notification_type: "renewal_reminder",
              subject: emailSubject,
              days_until_expiry: daysUntilExpiry,
              status: "sent",
            });
          }
        } catch (emailErr: any) {
          console.error(`Error sending email for license ${license.id}:`, emailErr);
          errors.push(`${license.contact_email}: ${emailErr.message}`);
          
          // Log failed notification
          notificationLogs.push({
            license_id: license.id,
            account_id: license.account_id,
            recipient_email: license.contact_email,
            recipient_name: license.contact_full_name,
            notification_type: "renewal_reminder",
            subject: emailSubject,
            days_until_expiry: daysUntilExpiry,
            status: "failed",
            error_message: emailErr.message,
          });
        }
      }
    }

    // Insert notification logs into database
    if (notificationLogs.length > 0) {
      const { error: logError } = await supabase
        .from("notification_history")
        .insert(notificationLogs);

      if (logError) {
        console.error("Error logging notifications:", logError);
      } else {
        console.log(`Logged ${notificationLogs.length} notifications to history`);
      }
    }

    const response = {
      success: true,
      message: `Processed ${licenses?.length || 0} licenses`,
      emailsSent: emailsSent.length,
      recipients: emailsSent,
      logged: notificationLogs.length,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log("Renewal reminder process completed:", response);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-renewal-reminders function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
