import { useState, useEffect } from "react";
import trumpetLogo from "@/assets/trumpet-logo.png";
import { motion } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Github,
  Chrome,
  AlertCircle,
  CheckCircle,
  GitBranch,
  Shield,
  Zap,
  BarChart3,
  Layers,
  Workflow,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PasswordStrengthMeter } from "@/components/auth/PasswordStrengthMeter";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

const platformFeatures = [
  {
    icon: Workflow,
    title: "Visual Pipeline Builder",
    desc: "Drag-and-drop CI/CD pipeline creation with 50+ pre-built stages",
  },
  {
    icon: Zap,
    title: "AI-Powered Generation",
    desc: "Describe your workflow in plain English and let AI build it",
  },
  {
    icon: BarChart3,
    title: "Real-Time Monitoring",
    desc: "Live build logs, metrics, and intelligent failure analysis",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    desc: "Role-based access, credential vaults, and audit trails",
  },
];

const stats = [
  { value: "99.9%", label: "Uptime SLA" },
  { value: "50+", label: "Integrations" },
  { value: "10x", label: "Faster Deploys" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});
  
  // OTP confirmation state
  const [showOtpConfirm, setShowOtpConfirm] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  const { signIn, signUp, confirmSignUp, resendConfirmationCode, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: Location })?.from?.pathname || "/";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const validateForm = () => {
    try {
      const schema = isSignUp ? signupSchema : loginSchema;
      schema.parse({ email, password });
      setValidationErrors({});
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: { email?: string; password?: string } = {};
        err.errors.forEach((e) => {
          if (e.path[0] === "email") errors.email = e.message;
          if (e.path[0] === "password") errors.password = e.message;
        });
        setValidationErrors(errors);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password);
        if (error) {
          if (error.message.includes("UsernameExistsException") || error.message.includes("already exists")) {
            setError("This email is already registered. Please sign in instead.");
          } else {
            setError(error.message);
          }
        } else {
          // Show OTP confirmation step
          setPendingEmail(email);
          setShowOtpConfirm(true);
          setSuccess("Account created! We've sent a 6-digit verification code to your email.");
          setPassword("");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("NotAuthorizedException") || error.message.includes("Incorrect")) {
            setError("Invalid email or password. Please try again.");
          } else if (error.message.includes("UserNotConfirmedException")) {
            // Show OTP confirmation step for unconfirmed user
            setPendingEmail(email);
            setShowOtpConfirm(true);
            setError("");
            setSuccess("Your account is not yet verified. Please enter the verification code sent to your email.");
          } else if (error.message.includes("New password required")) {
            setError("You need to set a new password. Please use the forgot password flow.");
          } else {
            setError(error.message);
          }
        }
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!otpCode || otpCode.length < 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await confirmSignUp(pendingEmail, otpCode);
      if (error) {
        if (error.message.includes("CodeMismatchException")) {
          setError("Invalid verification code. Please check and try again.");
        } else if (error.message.includes("ExpiredCodeException")) {
          setError("Verification code has expired. Click 'Resend Code' to get a new one.");
        } else {
          setError(error.message);
        }
      } else {
        setSuccess("Email verified successfully! You can now sign in.");
        setShowOtpConfirm(false);
        setOtpCode("");
        setIsSignUp(false);
        setEmail(pendingEmail);
        setPendingEmail("");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setIsLoading(true);
    try {
      const { error } = await resendConfirmationCode(pendingEmail);
      if (error) {
        setError(error.message);
      } else {
        setSuccess("A new verification code has been sent to your email.");
        setResendCooldown(60);
      }
    } catch (err) {
      setError("Failed to resend code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel - Branding & Content */}
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex lg:w-[55%] relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, hsl(213 50% 10%), hsl(213 50% 16%), hsl(213 40% 12%))",
        }}
      >
        {/* Background Effects */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 right-20 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-20 left-10 w-[400px] h-[400px] rounded-full blur-[100px]" style={{ background: "hsl(186 99% 51% / 0.08)" }} />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "linear-gradient(hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100%) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-14 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <motion.div
              className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden"
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <img src={trumpetLogo} alt="Trumpet" className="w-full h-full object-cover" />
            </motion.div>
            <div>
              <span className="text-xl font-bold text-white tracking-tight">Trumpet DevOps</span>
              <p className="text-[11px] text-white/40 -mt-0.5 tracking-wider uppercase">CI/CD Platform</p>
            </div>
          </div>

          {/* Hero Content */}
          <div className="space-y-8 max-w-lg">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 mb-6">
                <GitBranch className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-white/70">Enterprise-Grade CI/CD</span>
              </div>

              <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-[1.15] tracking-tight">
                Ship Faster with
                <br />
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: "linear-gradient(135deg, hsl(213 97% 60%), hsl(186 99% 55%))" }}
                >
                  Intelligent Pipelines
                </span>
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-base xl:text-lg text-white/60 leading-relaxed"
            >
              Streamline your integration deployments, extension rollouts, and cloud analytics with AI-powered automation built for enterprise teams.
            </motion.p>

            {/* Feature Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-2 gap-3"
            >
              {platformFeatures.map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="group p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
                >
                  <feature.icon className="w-5 h-5 text-primary mb-2" />
                  <h3 className="text-sm font-semibold text-white/90 mb-1">{feature.title}</h3>
                  <p className="text-xs text-white/45 leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="flex items-center gap-8 pt-2"
            >
              {stats.map((stat, i) => (
                <div key={i} className="text-center">
                  <div
                    className="text-2xl font-bold bg-clip-text text-transparent"
                    style={{ backgroundImage: "linear-gradient(135deg, hsl(213 97% 65%), hsl(186 99% 55%))" }}
                  >
                    {stat.value}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-white/30">
            <span>© 2024 Trumpet DevOps. All rights reserved.</span>
            <div className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              <span>v2.4.0</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Right Panel - Login Form */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-8"
      >
        <div className="w-full max-w-[420px] space-y-7">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={trumpetLogo} alt="Trumpet" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl font-bold gradient-text">Trumpet DevOps</span>
          </div>

          {/* Header */}
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {showOtpConfirm
                ? "Verify your email"
                : isSignUp
                ? "Create your account"
                : "Welcome back"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              {showOtpConfirm
                ? `Enter the 6-digit code sent to ${pendingEmail}`
                : isSignUp
                ? "Get started with your CI/CD dashboard in minutes"
                : "Sign in to manage your pipelines and deployments"}
            </p>
          </div>

          {/* OTP Confirmation Form */}
          {showOtpConfirm ? (
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              {success && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 p-3 rounded-lg border text-sm"
                  style={{
                    background: "hsl(186 99% 51% / 0.08)",
                    borderColor: "hsl(186 99% 51% / 0.2)",
                    color: "hsl(186 80% 35%)",
                  }}
                >
                  <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </motion.div>
              )}

              {/* OTP Input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Verification Code</label>
                <div className="relative">
                  <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="pl-10 h-11 bg-background border-border focus:border-primary text-center text-lg tracking-[0.5em] font-mono"
                    autoFocus
                  />
                </div>
              </div>

              {/* Verify Button */}
              <Button
                type="submit"
                disabled={isLoading || otpCode.length < 6}
                className="w-full h-11 font-medium gap-2 text-white"
                style={{
                  background: "linear-gradient(135deg, hsl(213 97% 47%), hsl(213 97% 40%))",
                }}
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    Verify Email
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              {/* Resend Code */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0 || isLoading}
                  className="text-sm text-primary hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOtpConfirm(false);
                    setOtpCode("");
                    setError("");
                    setSuccess("");
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Back to sign in
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Login/Signup Form */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </motion.div>
                )}

                {success && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2.5 p-3 rounded-lg border text-sm"
                    style={{
                      background: "hsl(186 99% 51% / 0.08)",
                      borderColor: "hsl(186 99% 51% / 0.2)",
                      color: "hsl(186 80% 35%)",
                    }}
                  >
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{success}</span>
                  </motion.div>
                )}

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`pl-10 h-11 bg-background border-border focus:border-primary ${
                        validationErrors.email ? "border-destructive" : ""
                      }`}
                      required
                    />
                  </div>
                  {validationErrors.email && (
                    <p className="text-xs text-destructive">{validationErrors.email}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Password</label>
                    {!isSignUp && (
                      <Link to="/forgot-password" className="text-xs text-primary hover:underline font-medium">
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={`pl-10 pr-10 h-11 bg-background border-border focus:border-primary ${
                        validationErrors.password ? "border-destructive" : ""
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validationErrors.password && (
                    <p className="text-xs text-destructive">{validationErrors.password}</p>
                  )}
                  {isSignUp && <PasswordStrengthMeter password={password} />}
                </div>

                {/* Remember Me */}
                {!isSignUp && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                    />
                    <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer select-none">
                      Remember me for 30 days
                    </label>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 font-medium gap-2 text-white"
                  style={{
                    background: "linear-gradient(135deg, hsl(213 97% 47%), hsl(213 97% 40%))",
                  }}
                >
                  {isLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    />
                  ) : (
                    <>
                      {isSignUp ? "Create Account" : "Sign In"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              {/* Social Logins */}
              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" className="h-11 gap-2 text-sm" type="button">
                  <Chrome className="w-4 h-4" />
                  Google
                </Button>
                <Button variant="outline" className="h-11 gap-2 text-sm" type="button">
                  <Github className="w-4 h-4" />
                  GitHub
                </Button>
              </div>

              {/* Toggle */}
              <p className="text-center text-sm text-muted-foreground">
                {isSignUp ? "Already have an account? " : "Don't have an account? "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setError("");
                    setSuccess("");
                    setValidationErrors({});
                  }}
                  className="text-primary font-semibold hover:underline"
                >
                  {isSignUp ? "Sign in" : "Sign up for free"}
                </button>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
