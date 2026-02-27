import { useQueryClient, useIsFetching } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAccountContext } from '@/contexts/AccountContext';
import { useEnterpriseContext } from '@/contexts/EnterpriseContext';

/**
 * Hook to clear React Query cache when account or enterprise selection changes.
 * This ensures stale data is not displayed when switching contexts.
 * Also provides a transitioning state for visual feedback.
 */
export function useMultiTenantCacheClear() {
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();

  // Store previous selections to detect changes
  const prevAccountId = useRef<string | null>(null);
  const prevEnterpriseId = useRef<string | null>(null);
  
  // Track if we're in a context transition
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    const currentAccountId = selectedAccount?.id ?? null;
    const currentEnterpriseId = selectedEnterprise?.id ?? null;

    // Check if any of the selections have changed (skip initial mount)
    if (
      prevAccountId.current !== null &&
      prevEnterpriseId.current !== null &&
      (currentAccountId !== prevAccountId.current ||
        currentEnterpriseId !== prevEnterpriseId.current)
    ) {
      // Set transitioning state
      setIsTransitioning(true);
      
      // Invalidate all cached queries when account or enterprise changes
      // This triggers a refetch for any active queries
      queryClient.invalidateQueries();
    }

    // Update previous selections
    prevAccountId.current = currentAccountId;
    prevEnterpriseId.current = currentEnterpriseId;
  }, [selectedAccount?.id, selectedEnterprise?.id, queryClient]);

  // Clear transitioning state when fetching completes
  useEffect(() => {
    if (isTransitioning && isFetching === 0) {
      // Add a small delay for smoother visual transition
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isFetching, isTransitioning]);

  return { isTransitioning };
}
