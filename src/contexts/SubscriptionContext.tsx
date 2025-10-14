import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SubscriptionContextType {
  subscribed: boolean;
  planSlug: string;
  subscriptionEnd: string | null;
  loading: boolean;
  checkSubscription: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscribed, setSubscribed] = useState(false);
  const [planSlug, setPlanSlug] = useState('free');
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const checkSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('check-subscription');
      
      if (error) {
        console.error('Error checking subscription:', error);
        return;
      }

      if (data) {
        setSubscribed(data.subscribed || false);
        setPlanSlug(data.plan_slug || 'free');
        setSubscriptionEnd(data.subscription_end || null);
      }
    } catch (error) {
      console.error('Subscription check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      
      if (error) throw error;

      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (error: any) {
      console.error('Portal error:', error);
      toast.error('Failed to open customer portal', {
        description: error.message || 'Please try again or contact support.'
      });
    }
  };

  useEffect(() => {
    checkSubscription();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        checkSubscription();
      } else if (event === 'SIGNED_OUT') {
        setSubscribed(false);
        setPlanSlug('free');
        setSubscriptionEnd(null);
      }
    });

    // Check subscription every 60 seconds
    const interval = setInterval(checkSubscription, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Check subscription when returning from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscription') === 'success') {
      setTimeout(() => {
        checkSubscription();
        toast.success('Subscription activated!', {
          description: 'Your plan has been successfully upgraded.'
        });
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }, 2000);
    }
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        subscribed,
        planSlug,
        subscriptionEnd,
        loading,
        checkSubscription,
        openCustomerPortal,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
