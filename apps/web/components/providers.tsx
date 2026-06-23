'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { ThemeProvider } from 'next-themes';
import { getMsalConfig, isEntraConfigured } from '@/lib/msal';
import { Toaster } from './ui/sonner';

/**
 * Lazily creates + initializes the MSAL client (msal-browser v3 requires
 * `initialize()` before use). Only mounted when Entra is configured, so locally
 * this never runs and the dev-user picker stays the auth path.
 */
function EntraProvider({ children }: { children: React.ReactNode }) {
  const [instance, setInstance] = React.useState<PublicClientApplication | null>(null);

  React.useEffect(() => {
    const config = getMsalConfig();
    if (!config) return;
    const pca = new PublicClientApplication(config);
    pca.initialize().then(() => setInstance(pca));
  }, []);

  if (!instance) return <>{children}</>;
  return <MsalProvider instance={instance}>{children}</MsalProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  const tree = (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={client}>
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );

  return isEntraConfigured() ? <EntraProvider>{tree}</EntraProvider> : tree;
}
