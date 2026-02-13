import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
  { label: "At least 12 characters", test: (p) => p.length >= 12 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const getPasswordStrength = (password: string): { score: number; label: string; color: string } => {
  if (!password) return { score: 0, label: "", color: "" };
  
  let score = 0;
  
  // Length scoring
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  
  // Character variety
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  
  // Bonus for extra complexity
  if (/[^A-Za-z0-9].*[^A-Za-z0-9]/.test(password)) score += 1;
  if (password.length >= 20) score += 1;
  
  // Map score to strength level
  if (score <= 3) return { score: 25, label: "Weak", color: "bg-destructive" };
  if (score <= 5) return { score: 50, label: "Fair", color: "bg-warning" };
  if (score <= 7) return { score: 75, label: "Good", color: "bg-accent" };
  return { score: 100, label: "Strong", color: "bg-accent" };
};

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
}

export function PasswordStrengthMeter({ password, showRequirements = true }: PasswordStrengthMeterProps) {
  const strength = getPasswordStrength(password);

  if (!password) return null;

  return (
    <div className="space-y-3">
      {/* Strength Bar */}
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        className="space-y-2"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Password strength</span>
          <motion.span
            key={strength.label}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className={`text-xs font-semibold ${
              strength.label === "Weak" ? "text-destructive" :
              strength.label === "Fair" ? "text-warning" :
              "text-accent"
            }`}
          >
            {strength.label}
          </motion.span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${strength.score}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`h-full rounded-full ${strength.color} transition-colors duration-300`}
          />
        </div>
      </motion.div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className="space-y-2 p-3 rounded-lg bg-muted/50 border">
          <p className="text-xs font-medium text-foreground">Password requirements:</p>
          <div className="grid grid-cols-1 gap-1">
            {passwordRequirements.map((req, index) => {
              const isMet = req.test(password);
              return (
                <motion.div
                  key={index}
                  initial={false}
                  animate={{ 
                    scale: isMet ? [1, 1.05, 1] : 1,
                    transition: { duration: 0.2 }
                  }}
                  className={`flex items-center gap-2 text-xs transition-colors duration-200 ${
                    isMet ? "text-accent" : "text-muted-foreground"
                  }`}
                >
                  <motion.span
                    initial={false}
                    animate={{ 
                      rotate: isMet ? [0, 360] : 0,
                      transition: { duration: 0.3 }
                    }}
                  >
                    {isMet ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <X className="w-3 h-3" />
                    )}
                  </motion.span>
                  {req.label}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Export requirements for use in validation schemas
export { passwordRequirements, getPasswordStrength };
