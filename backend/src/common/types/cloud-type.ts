/**
 * Cloud deployment type for accounts.
 * - public:  shared multi-tenant infrastructure
 * - private: dedicated per-account infrastructure
 * - hybrid:  combination of public and private resources
 */
export type CloudType = 'public' | 'private' | 'hybrid';
