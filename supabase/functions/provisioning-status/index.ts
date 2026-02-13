import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Provisioning Status Edge Function
 * 
 * This edge function simulates CloudFormation stack status polling.
 * In a production environment, this would:
 * 1. Call AWS CloudFormation DescribeStacks API
 * 2. Store provisioning jobs in DynamoDB or similar
 * 3. Use EventBridge/SNS for real-time notifications
 * 
 * For now, it demonstrates the API contract for the NestJS backend.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProvisioningJobResponse {
  id: string;
  accountId: string;
  accountName: string;
  cloudType: "public" | "private";
  status: "pending" | "in_progress" | "completed" | "failed";
  message: string;
  stackId?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  progress: number;
}

interface StartProvisioningRequest {
  accountId: string;
  accountName: string;
  cloudType: "public" | "private";
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // POST /provisioning-status - Start new provisioning
    // In production: Creates CloudFormation stack and stores job in DynamoDB
    if (req.method === "POST") {
      const body: StartProvisioningRequest = await req.json();
      const { accountId, accountName, cloudType } = body;
      
      if (!accountId || !accountName || !cloudType) {
        return new Response(
          JSON.stringify({ 
            error: "Missing required fields: accountId, accountName, cloudType",
            code: "INVALID_REQUEST" 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Simulate job creation (in production: call CloudFormation CreateStack)
      const job: ProvisioningJobResponse = {
        id: crypto.randomUUID(),
        accountId,
        accountName,
        cloudType,
        status: "pending",
        message: "Queued for provisioning...",
        stackId: `arn:aws:cloudformation:us-east-1:123456789:stack/${accountId}-stack/${crypto.randomUUID()}`,
        startedAt: new Date().toISOString(),
        progress: 0,
      };

      console.log(`[PROVISIONING] Started job for account: ${accountName} (${cloudType})`);
      console.log(`[PROVISIONING] Stack ID: ${job.stackId}`);

      // In production: Store job in DynamoDB, trigger Step Functions workflow
      // await dynamodb.put({ TableName: 'ProvisioningJobs', Item: job });
      // await stepFunctions.startExecution({ ... });

      return new Response(
        JSON.stringify({ 
          success: true, 
          job,
          message: "Provisioning job created. Poll GET /provisioning-status?accountId=xxx for updates."
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /provisioning-status?accountId=xxx - Get status
    // In production: Query DynamoDB and CloudFormation for current status
    if (req.method === "GET") {
      const accountId = url.searchParams.get("accountId");
      
      if (!accountId) {
        return new Response(
          JSON.stringify({ 
            error: "Missing accountId query parameter",
            code: "INVALID_REQUEST",
            usage: "GET /provisioning-status?accountId=<account-id>"
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // In production: Query DynamoDB for job, then CloudFormation for real status
      // const job = await dynamodb.get({ TableName: 'ProvisioningJobs', Key: { accountId } });
      // const stackStatus = await cloudformation.describeStacks({ StackName: job.stackId });

      // Simulate response (would be real data in production)
      const simulatedResponse: ProvisioningJobResponse = {
        id: crypto.randomUUID(),
        accountId,
        accountName: "Simulated Account",
        cloudType: "private",
        status: "in_progress",
        message: "Creating dedicated DynamoDB table...",
        stackId: `arn:aws:cloudformation:us-east-1:123456789:stack/${accountId}-stack/xxx`,
        startedAt: new Date(Date.now() - 5000).toISOString(),
        progress: 35,
      };

      console.log(`[PROVISIONING] Status check for account: ${accountId}`);

      return new Response(
        JSON.stringify({ 
          job: simulatedResponse,
          note: "This is a simulated response. In production, this queries CloudFormation."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DELETE /provisioning-status?accountId=xxx - Cancel/cleanup provisioning
    // In production: Delete CloudFormation stack if still creating, clean up DynamoDB
    if (req.method === "DELETE") {
      const accountId = url.searchParams.get("accountId");
      
      if (!accountId) {
        return new Response(
          JSON.stringify({ error: "Missing accountId query parameter" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[PROVISIONING] Cleanup requested for account: ${accountId}`);

      // In production: Delete from DynamoDB, optionally delete CloudFormation stack
      // await dynamodb.delete({ TableName: 'ProvisioningJobs', Key: { accountId } });
      // await cloudformation.deleteStack({ StackName: stackId });

      return new Response(
        JSON.stringify({ 
          success: true,
          message: `Provisioning job for ${accountId} cleaned up.`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: "Method not allowed",
        allowedMethods: ["GET", "POST", "DELETE"]
      }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[PROVISIONING] Error:", errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        code: "INTERNAL_ERROR"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
