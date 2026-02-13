import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle } from "lucide-react";

const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"success" | "error" | "closing">("closing");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth_status");
    const oauthError = searchParams.get("oauth_error");

    if (oauthStatus === "success") {
      setStatus("success");
    } else if (oauthStatus === "error") {
      setStatus("error");
      setErrorMessage(oauthError || "Authorization failed");
    }

    // Try to close the window immediately
    const closeTimer = setTimeout(() => {
      window.close();
    }, 100);

    // If window doesn't close after 2 seconds, user will see the message
    const fallbackTimer = setTimeout(() => {
      if (!window.closed) {
        // Window couldn't be closed, show message
      }
    }, 2000);

    return () => {
      clearTimeout(closeTimer);
      clearTimeout(fallbackTimer);
    };
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
      <div className="text-center p-8">
        {status === "success" ? (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-semibold mb-2">Authorization Successful!</h1>
            <p className="text-muted-foreground">This window will close automatically...</p>
          </>
        ) : status === "error" ? (
          <>
            <XCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-semibold mb-2">Authorization Failed</h1>
            <p className="text-muted-foreground">{errorMessage}</p>
            <p className="text-sm text-muted-foreground mt-2">You can close this window.</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-semibold mb-2">Completing Authorization...</h1>
            <p className="text-muted-foreground">Please wait...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
