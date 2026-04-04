import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Register from "@/pages/Register";

const mockNavigate = vi.fn();
const mockRegister = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    register: mockRegister,
    isAuthenticated: false,
    homePath: "/dashboard",
  }),
}));

describe("Register", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockRegister.mockReset();
    mockRegister.mockResolvedValue({ success: true, loggedIn: false });
  });

  it("redirects to login when registration succeeds without auto-login", async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Register />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("Full Name"), { target: { value: "Rahul Kumar" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+919876543210" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rahul@example.com" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Mumbai" } });
    fireEvent.click(screen.getByRole("button", { name: "Zomato" }));
    fireEvent.change(screen.getByLabelText("Avg Daily Income (₹)"), { target: { value: "850" } });

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Strong1!" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "Strong1!" } });

    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
