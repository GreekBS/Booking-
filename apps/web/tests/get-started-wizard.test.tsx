/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GetStartedWizard } from "@/features/get-started/GetStartedWizard";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderWizard(
  overrides: Partial<React.ComponentProps<typeof GetStartedWizard>> = {},
) {
  return render(
    <GetStartedWizard
      source="homepage_hero"
      utmSource={null}
      utmMedium={null}
      utmCampaign={null}
      preselectManaged={false}
      {...overrides}
    />,
  );
}

async function fillStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^Ονοματεπώνυμο/), "Ada Owner");
  await user.type(screen.getByLabelText(/^Email/), "ada@example.com");
  await user.selectOptions(screen.getByLabelText(/^Χώρα$/), "Greece");
  await user.click(screen.getByRole("radio", { name: "Ιδιοκτήτης" }));
}

async function fillStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "2–5" }));
  await user.click(screen.getByRole("checkbox", { name: "Βίλα" }));
  await user.selectOptions(screen.getByLabelText(/^Χώρα καταλύματος/), "Greece");
  await user.click(screen.getByRole("radio", { name: "Ήδη σε λειτουργία" }));
}

describe("GetStartedWizard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "lead-1" }),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts at step 1 and blocks Next when invalid", async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(screen.getByText(/Βήμα 1 από 5/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    expect(screen.getByText(/Βήμα 1 από 5/i)).toBeTruthy();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("advances on valid Next and preserves values on Back", async () => {
    const user = userEvent.setup();
    renderWizard();
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    expect(screen.getByText(/Βήμα 2 από 5/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Πίσω/i }));
    expect(screen.getByLabelText(/^Ονοματεπώνυμο/)).toHaveValue("Ada Owner");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("ada@example.com");
  });

  it("submits to marketing leads API with stable submissionId on retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Temporary failure" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "lead-1" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    renderWizard();
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await fillStep2(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("checkbox", { name: /Λειτουργία/i }));
    await user.click(screen.getByRole("button", { name: /^Υποβολή$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Temporary failure/i)).toBeTruthy();
    // Still on step 5 — interests preserved
    expect(screen.getByRole("checkbox", { name: /Λειτουργία/i })).toBeChecked();

    await user.click(screen.getByRole("button", { name: /Δοκιμάστε ξανά/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const body1 = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    const body2 = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/marketing/v1/leads");
    expect(body1.submissionId).toBe(body2.submissionId);
    expect(body1.source).toBe("homepage_hero");
    expect(body1.relationship).toBe("owner");
    expect(body1.portfolioSize).toBe("two_to_five");
    expect(body1.interests).toEqual(["run"]);

    await waitFor(() =>
      expect(screen.getByText(/Ευχαριστούμε, Ada/i)).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ζητήστε επίδειξη/i })).toBeTruthy();
  });

  it("transitions to registration in the same wizard after Create Account", async () => {
    const user = userEvent.setup();
    renderWizard();
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await fillStep2(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("checkbox", { name: /Λειτουργία/i }));
    await user.click(screen.getByRole("button", { name: /^Υποβολή$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/i })).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/i }));
    expect(screen.getByRole("button", { name: /Εγγραφή/i })).toBeTruthy();
    expect(screen.getByLabelText(/^Όνομα/)).toHaveValue("Ada Owner");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("ada@example.com");
  });

  it("records demo request and shows confirmation; failure keeps success choices", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "lead-1" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Demo unavailable" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "lead-1",
          demoRequestedAt: "2026-09-20T12:00:00.000Z",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    renderWizard();
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await fillStep2(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("checkbox", { name: /Λειτουργία/i }));
    await user.click(screen.getByRole("button", { name: /^Υποβολή$/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Ζητήστε επίδειξη/i })).toBeTruthy(),
    );

    await user.click(screen.getByRole("button", { name: /Ζητήστε επίδειξη/i }));
    await waitFor(() => expect(screen.getByText(/Demo unavailable/i)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Δημιουργία λογαριασμού/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Ζητήστε επίδειξη/i }));
    await waitFor(() =>
      expect(screen.getByText(/Το αίτημα επίδειξης καταχωρήθηκε/i)).toBeTruthy(),
    );
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/marketing/v1/leads/lead-1/demo");
    expect(fetchMock.mock.calls[2]![0]).toBe("/api/marketing/v1/leads/lead-1/demo");
  });

  it("prevents duplicate submit while in flight", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderWizard();
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await fillStep2(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("checkbox", { name: /Λειτουργία/i }));

    const submit = screen.getByRole("button", { name: /^Υποβολή$/i });
    await user.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /Αποστολή/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({ id: "lead-1" }),
    });
    await waitFor(() => expect(screen.getByText(/Ευχαριστούμε, Ada/i)).toBeTruthy());
  });

  it("shows managed preselection on final step", async () => {
    const user = userEvent.setup();
    renderWizard({ source: "property_management", preselectManaged: true });
    await fillStep1(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await fillStep2(user);
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    await user.click(screen.getByRole("button", { name: /Συνέχεια/i }));
    expect(
      screen.getByRole("checkbox", { name: /Αφήστε το Talos να το διαχειριστεί/i }),
    ).toBeChecked();
  });
});
