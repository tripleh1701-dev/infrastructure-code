import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NotificationSubscriber {
  id: string;
  account_id: string;
  email: string;
  display_name: string | null;
  filter_type: 'all' | 'failures_only' | 'cloud_type';
  cloud_type_filter: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CreateSubscriberInput {
  account_id: string;
  email: string;
  display_name?: string;
  filter_type: 'all' | 'failures_only' | 'cloud_type';
  cloud_type_filter?: string[];
}

export function useNotificationSubscribers(accountId: string | undefined) {
  const [subscribers, setSubscribers] = useState<NotificationSubscriber[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSubscribers = useCallback(async () => {
    if (!accountId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('provisioning_notification_subscribers' as any)
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscribers((data as any[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch notification subscribers:', err);
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  const addSubscriber = async (input: CreateSubscriberInput) => {
    try {
      const { error } = await supabase
        .from('provisioning_notification_subscribers' as any)
        .insert({
          account_id: input.account_id,
          email: input.email,
          display_name: input.display_name || null,
          filter_type: input.filter_type,
          cloud_type_filter: input.cloud_type_filter || [],
        } as any);

      if (error) {
        if (error.code === '23505') {
          toast.error('This email is already subscribed');
          return false;
        }
        throw error;
      }
      toast.dismiss();
      toast.success('Subscriber added successfully');
      await fetchSubscribers();
      return true;
    } catch (err: any) {
      toast.error(`Failed to add subscriber: ${err.message}`);
      return false;
    }
  };

  const updateSubscriber = async (id: string, updates: Partial<Pick<NotificationSubscriber, 'email' | 'filter_type' | 'cloud_type_filter' | 'is_active' | 'display_name'>>) => {
    try {
      const { error } = await supabase
        .from('provisioning_notification_subscribers' as any)
        .update(updates as any)
        .eq('id', id);

      if (error) throw error;
      toast.dismiss();
      toast.success('Subscriber updated');
      await fetchSubscribers();
      return true;
    } catch (err: any) {
      toast.error(`Failed to update: ${err.message}`);
      return false;
    }
  };

  const deleteSubscriber = async (id: string) => {
    try {
      const { error } = await supabase
        .from('provisioning_notification_subscribers' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.dismiss();
      toast.success('Subscriber removed');
      await fetchSubscribers();
      return true;
    } catch (err: any) {
      toast.error(`Failed to remove: ${err.message}`);
      return false;
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    return updateSubscriber(id, { is_active: !isActive });
  };

  return {
    subscribers,
    isLoading,
    refetch: fetchSubscribers,
    addSubscriber,
    updateSubscriber,
    deleteSubscriber,
    toggleActive,
  };
}
