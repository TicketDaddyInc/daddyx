import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import NotFound from "@/pages/not-found";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo } from "react";
import { SOLANA_RPC_URL } from "@/lib/constants";
import "@solana/wallet-adapter-react-ui/styles.css";

import HomePage from "@/pages/home";
import EventsPage from "@/pages/events";
import EventDetailPage from "@/pages/event-detail";
import DashboardPage from "@/pages/dashboard";
import OrganizerPage from "@/pages/organizer";
import CreatorApplyPage from "@/pages/creator-apply";
import CreatorStatusPage from "@/pages/creator-status";
import AdminPage from "@/pages/admin";
import WhitepaperPage from "@/pages/whitepaper";
import PitchPage from "@/pages/pitch";
import HowItWorksPage from "@/pages/how-it-works";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <>
      <Navbar />
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/daddyx" component={HowItWorksPage} />
        <Route path="/events" component={EventsPage} />
        <Route path="/events/:id" component={EventDetailPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/organizer" component={OrganizerPage} />
        <Route path="/creator/apply" component={CreatorApplyPage} />
        <Route path="/creator/status" component={CreatorStatusPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/whitepaper" component={WhitepaperPage} />
        <Route path="/pitch" component={PitchPage} />
        <Route component={NotFound} />
      </Switch>
      <Footer />
    </>
  );
}

function App() {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={SOLANA_RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
