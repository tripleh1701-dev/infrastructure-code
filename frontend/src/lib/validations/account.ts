import { z } from "zod";

// Password validation with detailed requirements
const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[!@#$%^&*]/, "Password must contain at least one special character (!@#$%^&*)");

// Address schema
export const addressSchema = z.object({
  id: z.string().optional(),
  line1: z.string().min(1, "Address line 1 is required").max(200, "Address line 1 must be less than 200 characters"),
  line2: z.string().max(200, "Address line 2 must be less than 200 characters").optional().or(z.literal("")),
  city: z.string().min(1, "City is required").max(100, "City must be less than 100 characters"),
  state: z.string().min(1, "State/Province is required").max(100, "State must be less than 100 characters"),
  country: z.string().min(1, "Country is required").max(100, "Country must be less than 100 characters"),
  postalCode: z.string().min(1, "Postal code is required").max(20, "Postal code must be less than 20 characters").regex(/^\d+$/, "Postal code must contain only numbers"),
});

// Technical user schema
export const technicalUserSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50, "First name must be less than 50 characters"),
  middleName: z.string().max(50, "Middle name must be less than 50 characters").optional().or(z.literal("")),
  lastName: z.string().min(1, "Last name is required").max(50, "Last name must be less than 50 characters"),
  email: z.string().min(1, "Email is required").email("Invalid email address").max(255, "Email must be less than 255 characters"),
  status: z.enum(["active", "inactive"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().or(z.literal("")),
  password: passwordSchema,
  assignedGroup: z.string().min(1, "Assigned group is required"),
  assignedRole: z.string().min(1, "Assigned role is required"),
});

// Main account form schema
export const accountFormSchema = z.object({
  accountName: z.string().min(1, "Account name is required").max(100, "Account name must be less than 100 characters"),
  masterAccountName: z.string().min(1, "Master account name is required").max(100, "Master account name must be less than 100 characters"),
  cloudType: z.enum(["public", "private", "hybrid"], {
    required_error: "Cloud type is required",
  }),
  addresses: z.array(addressSchema).min(1, "At least one address is required"),
  technicalUser: technicalUserSchema,
});

export type AccountFormData = z.infer<typeof accountFormSchema>;
export type AddressData = z.infer<typeof addressSchema>;
export type TechnicalUserData = z.infer<typeof technicalUserSchema>;

// Helper function to validate password and return requirement status
export function getPasswordRequirementStatus(password: string) {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*]/.test(password),
  };
}
