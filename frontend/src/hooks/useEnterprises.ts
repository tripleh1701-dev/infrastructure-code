import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isExternalApi } from "@/lib/api/config";
import { httpClient } from "@/lib/api/http-client";

interface EnterpriseWithDetails {
  id: string;
  name: string;
  created_at: string;
  product: {
    id: string;
    name: string;
  } | null;
  services: {
    id: string;
    name: string;
  }[];
}

export function useEnterprises() {
  const [enterprises, setEnterprises] = useState<EnterpriseWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEnterprises = useCallback(async () => {
    setIsLoading(true);
    try {
      // External API mode: NestJS returns fully-joined enterprise data
      if (isExternalApi()) {
        const { data, error } = await httpClient.get<EnterpriseWithDetails[]>('/api/enterprises');
        if (error) throw new Error(error.message);
        setEnterprises(Array.isArray(data) ? data : []);
        return;
      }

      // Fetch enterprises
      const { data: enterprisesData, error: enterprisesError } = await supabase
        .from("enterprises")
        .select("*")
        .order("created_at", { ascending: false });

      if (enterprisesError) throw enterprisesError;

      // Fetch product linkages
      const { data: productLinkages, error: productError } = await supabase
        .from("enterprise_products")
        .select(`
          enterprise_id,
          product_id,
          products (
            id,
            name
          )
        `);

      if (productError) throw productError;

      // Fetch service linkages
      const { data: serviceLinkages, error: serviceError } = await supabase
        .from("enterprise_services")
        .select(`
          enterprise_id,
          service_id,
          services (
            id,
            name
          )
        `);

      if (serviceError) throw serviceError;

      // Map enterprises with their product and services
      const enterprisesWithDetails = (enterprisesData || []).map((enterprise) => {
        // Get linked product (single)
        const productLink = (productLinkages || []).find(
          (link) => link.enterprise_id === enterprise.id
        );
        const product = productLink?.products
          ? {
              id: (productLink.products as any).id,
              name: (productLink.products as any).name,
            }
          : null;

        // Get linked services (multiple)
        const linkedServices = (serviceLinkages || [])
          .filter((link) => link.enterprise_id === enterprise.id)
          .map((link) => ({
            id: (link.services as any).id,
            name: (link.services as any).name,
          }));

        return {
          ...enterprise,
          product,
          services: linkedServices,
        };
      });

      setEnterprises(enterprisesWithDetails);
    } catch (error) {
      console.error("Error fetching enterprises:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEnterprises();
  }, [fetchEnterprises]);

  return { enterprises, isLoading, refetch: fetchEnterprises };
}
