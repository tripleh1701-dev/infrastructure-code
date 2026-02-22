import "@testing-library/jest-dom";
import { vi } from "vitest";

// =============================================================================
// Global Test Environment: AWS / External API Mode
// =============================================================================
// All frontend tests run in "external" (AWS) API mode by default.
// This ensures tests validate the production code path (NestJS + DynamoDB).
// Individual test files can override these mocks if needed.
// =============================================================================

// Force external API provider globally
vi.mock("@/lib/api/config", () => ({
  API_CONFIG: {
    provider: "external",
    externalBaseUrl: "https://api.test.com",
    timeout: 5000,
    debug: false,
  },
  getApiBaseUrl: () => "https://api.test.com",
  isExternalApi: () => true,
}));

// Mock Cognito auth globally (no real tokens in tests)
vi.mock("@/lib/auth/cognito-client", () => ({
  cognitoAuth: {
    getTokens: vi.fn(() => null),
    getSession: vi.fn(() => Promise.resolve({ data: null, error: null })),
    signIn: vi.fn(),
    signOut: vi.fn(),
    signUp: vi.fn(),
    confirmSignUp: vi.fn(),
    forgotPassword: vi.fn(),
    confirmPassword: vi.fn(),
    getCurrentUser: vi.fn(() => null),
    onAuthStateChange: vi.fn(() => () => {}),
    isConfigured: vi.fn(() => true),
  },
}));

// Mock matchMedia for components that use responsive queries
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
