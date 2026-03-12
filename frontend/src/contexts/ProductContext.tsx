import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { httpClient } from "@/lib/api/http-client";
import { isExternalApi } from "@/lib/api/config";
import { useAuth } from "./AuthContext";
import { useAccountContext } from "./AccountContext";
import { useEnterpriseContext } from "./EnterpriseContext";

export interface Product {
  id: string;
  name: string;
}

interface ProductContextType {
  products: Product[];
  selectedProduct: Product | null;
  setSelectedProduct: (product: Product) => void;
  isLoading: boolean;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export function ProductProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { isAuthenticated, isSuperAdmin } = useAuth();
  const { selectedAccount } = useAccountContext();
  const { selectedEnterprise } = useEnterpriseContext();

  useEffect(() => {
    if (!isAuthenticated || !selectedAccount?.id) {
      setProducts([]);
      setSelectedProduct(null);
      return;
    }

    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        let productList: Product[] = [];

        if (isExternalApi()) {
          // Fetch from NestJS - get licenses then extract products
          const params: Record<string, string> = { accountId: selectedAccount.id };
          if (selectedEnterprise?.id) {
            params.enterpriseId = selectedEnterprise.id;
          }
          const { data, error } = await httpClient.get<any[]>("/licenses", { params });
          if (error) throw new Error(error.message);

          const productIds = [...new Set((data || []).map((l: any) => l.productId ?? l.product_id).filter(Boolean))];
          if (productIds.length > 0) {
            const { data: productsData, error: pErr } = await httpClient.get<any[]>("/products");
            if (pErr) throw new Error(pErr.message);
            productList = (productsData || [])
              .filter((p: any) => productIds.includes(p.id))
              .map((p: any) => ({ id: p.id, name: p.name }));
          }
        } else {
          // Supabase: get product IDs from licenses for this account/enterprise
          let query = supabase
            .from("account_licenses")
            .select("product_id")
            .eq("account_id", selectedAccount.id);

          if (selectedEnterprise?.id) {
            query = query.eq("enterprise_id", selectedEnterprise.id);
          }

          const { data: licenses, error: lErr } = await query;
          if (lErr) throw lErr;

          const productIds = [...new Set((licenses || []).map(l => l.product_id))];

          if (productIds.length > 0) {
            const { data: productsData, error: pErr } = await supabase
              .from("products")
              .select("id, name")
              .in("id", productIds)
              .order("name");

            if (pErr) throw pErr;
            productList = productsData || [];
          }
        }

        // Sort alphabetically
        productList.sort((a, b) => a.name.localeCompare(b.name));
        setProducts(productList);

        // Auto-select: keep current if still valid, else pick first
        if (selectedProduct) {
          const stillValid = productList.find(p => p.id === selectedProduct.id);
          if (!stillValid) {
            setSelectedProduct(productList.length > 0 ? productList[0] : null);
          }
        } else if (productList.length > 0) {
          setSelectedProduct(productList[0]);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
        setProducts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [isAuthenticated, selectedAccount?.id, selectedEnterprise?.id]);

  return (
    <ProductContext.Provider
      value={{
        products,
        selectedProduct,
        setSelectedProduct,
        isLoading,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
}

export function useProductContext() {
  const context = useContext(ProductContext);
  if (context === undefined) {
    throw new Error("useProductContext must be used within a ProductProvider");
  }
  return context;
}
