import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import { ApiError } from "./lib/api";
import "./index.css";

try {
  if (localStorage.getItem("theme") === "dark") document.documentElement.classList.add("dark");
} catch { /* storage unavailable */ }

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Session expired or revoked: drop the cached user so route guards send us to /login.
      if (error instanceof ApiError && error.status === 401 && query.queryKey[0] !== "me") queryClient.setQueryData(["me"], null);
    },
  }),
  defaultOptions: { queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500 && e.status !== 0) && n < 2, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/app">
        <AuthProvider>
          <App />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
