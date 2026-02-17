import { useState } from "react";
import trumpetLogo from "@/assets/trumpet-logo.png";
import { motion } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
  KeyRound,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { z } from "zod";

const passwordSchema = z.object({
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function ResetPasswordPage() {
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  const { confirmResetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Pre-fill email from forgot-password page navigation state
  const prefilledEmail = (location.state as { email?: string })?.email || "";
  useState(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setValidationErrors({});

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    if (!code) {
      setError("Please enter the verification code from your email.");
      return;
    }

    try {
      passwordSchema.parse({ password, confirmPassword });
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: { password?: string; confirmPassword?: string } = {};
        err.errors.forEach((e) => {
          if (e.path[0] === "password") errors.password = e.message;
          if (e.path[0] === "confirmPassword") errors.confirmPassword = e.message;
        });
        setValidationErrors(errors);
        return;
      }
    }

    setIsLoading(true);

    try {
      const { error } = await confirmResetPassword(email, code, password);
      if (error) {
        if (error.message.includes("CodeMismatchException")) {
          setError("Invalid verification code. Please check and try again.");
        } else if (error.message.includes("ExpiredCodeException")) {
          setError("Verification code has expired. Please request a new one.");
        } else {
          setError(error.message);
        }
      } else {
        setSuccess(true);
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex lg:w-1/2 bg-sidebar relative overflow-hidden"
      >
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-border/10 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-border/20 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] border border-border/30 rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center"
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <img src={trumpetLogo} alt="Trumpet" className="w-full h-full object-cover" />
            </motion.div>
            <span className="text-2xl font-bold gradient-text">Trumpet DevOps</span>
          </div>

          <div className="space-y-6">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl lg:text-5xl font-bold text-foreground leading-tight"
            >
              Create New
              <br />
              <span className="gradient-text">Password</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg text-muted-foreground max-w-md"
            >
              Enter the verification code from your email and choose a strong new password.
            </motion.p>
          </div>

          <div className="text-sm text-muted-foreground">
            © 2024 Trumpet DevOps. All rights reserved.
          </div>
        </div>
      </motion.div>

      {/* Right Panel - Form */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background"
      >
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center">
              <img src={trumpetLogo} alt="Trumpet" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl font-bold gradient-text">Trumpet DevOps</span>
          </div>

          {success ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-6"
            >
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-accent" />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-foreground">Password updated!</h2>
                <p className="text-muted-foreground mt-2">
                  Your password has been successfully changed. Redirecting you to sign in...
                </p>
              </div>
              <div className="flex justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full"
                />
              </div>
            </motion.div>
          ) : (
            <>
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold text-foreground">Set new password</h2>
                <p className="text-muted-foreground mt-2">
                  Enter the verification code and your new password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                  </motion.div>
                )}

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="john@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 h-11 bg-background-card border-border focus:border-primary input-glow"
                      required
                    />
                  </div>
                </div>

                {/* Verification Code */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Verification Code</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="pl-10 h-11 bg-background-card border-border focus:border-primary input-glow font-mono tracking-widest"
                      maxLength={6}
                      required
                    />
                  </div>
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`pl-10 pr-10 h-11 bg-background-card border-border focus:border-primary input-glow ${
                        validationErrors.password ? "border-destructive" : ""
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <p className="text-xs text-destructive">{validationErrors.password}</p>
                  )}
                </div>

                <PasswordStrengthMeter password={password} />

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={`pl-10 pr-10 h-11 bg-background-card border-border focus:border-primary input-glow ${
                        validationErrors.confirmPassword ? "border-destructive" : ""
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validationErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{validationErrors.confirmPassword}</p>
                  )}
                  {confirmPassword && password === confirmPassword && (
                    <p className="text-xs text-accent flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Passwords match
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white font-medium gap-2"
                >
                  {isLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Reset password
                    </>
                  )}
                </Button>
              </form>
            </>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Need a new code?{" "}
            <Link to="/forgot-password" className="text-primary font-medium hover:underline">
              Request again
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
