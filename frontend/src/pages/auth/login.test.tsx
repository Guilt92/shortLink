import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import Login from "./login";

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<div>dashboard page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("Login", () => {
  it("validates before calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "x" }), { status: 401 }));
    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    // only the initial /me probe happened, no login request
    expect(fetchMock.mock.calls.every(([u]) => String(u).includes("/api/me"))).toBe(true);
  });

  it("shows the server error on bad credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/api/auth/login")
        ? new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401 })
        : new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass1");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  it("redirects to the dashboard after a successful login", async () => {
    const user = { id: 1, email: "a@example.com", name: "A", role: "user", createdAt: new Date().toISOString() };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).includes("/api/auth/login") ? new Response(JSON.stringify(user), { status: 200 }) : new Response("{}", { status: 401 }),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText("Email"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("dashboard page")).toBeInTheDocument());
  });
});
