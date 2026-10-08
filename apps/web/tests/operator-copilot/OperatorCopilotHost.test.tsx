/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adminFetch, tenantState } = vi.hoisted(() => ({
  adminFetch: vi.fn(),
  tenantState: {
    value: {
      tenantId: "tenant-1" as string | null,
      profile: { user: { id: "user-1" } } as { user: { id: string } } | null,
    },
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/hooks/use-tenant", () => ({
  useTenant: () => tenantState.value,
}));

vi.mock("@/hooks/use-active-property", () => ({
  useActiveProperty: () => ({
    propertyId: "11111111-1111-4111-8111-111111111111",
    property: { id: "11111111-1111-4111-8111-111111111111", name: "Villa Aurora" },
  }),
}));

vi.mock("@/lib/admin/api", () => {
  class AdminApiError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  }
  return { adminFetch, AdminApiError };
});

import { OperatorCopilotHost } from "@/features/operator-copilot/components/OperatorCopilotHost";

const CONVERSATION_ID = "99999999-9999-4999-8999-999999999999";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function sendResult(reply: string) {
  return {
    conversationId: CONVERSATION_ID,
    operatorMessage: {
      id: "m-op",
      role: "operator",
      content: "status?",
      createdAt: "2026-10-08T10:00:00.000Z",
    },
    assistantMessage: {
      id: "m-ai",
      role: "assistant",
      content: reply,
      createdAt: "2026-10-08T10:00:01.000Z",
    },
    toolCallCount: 1,
    failed: false,
    errorCode: null,
  };
}

function installDefaultApi(reply = "Three arrivals today.") {
  adminFetch.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === "/copilot/conversations" && options?.method === "POST") {
      return { id: CONVERSATION_ID, status: "active" };
    }
    if (path.endsWith("/messages")) return sendResult(reply);
    if (path.endsWith("/archive")) return { conversation: { id: CONVERSATION_ID } };
    throw new Error(`unexpected path ${path}`);
  });
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Talia Operator Copilot" }));
  return screen.findByRole("dialog", { name: "Talia Operator Copilot" });
}

describe("OperatorCopilotHost", () => {
  beforeEach(() => {
    adminFetch.mockReset();
    localStorage.clear();
    sessionStorage.clear();
    tenantState.value = {
      tenantId: "tenant-1",
      profile: { user: { id: "user-1" } },
    };
    installDefaultApi();
  });

  it("renders nothing without a tenant or user", () => {
    tenantState.value = { tenantId: null, profile: null };
    render(<OperatorCopilotHost />);
    expect(screen.queryByTestId("operator-copilot-host")).toBeNull();
  });

  it("shows a labelled avatar and keeps the panel closed by default", async () => {
    render(<OperatorCopilotHost />);
    expect(
      await screen.findByRole("button", { name: "Talia Operator Copilot" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on click, closes on Esc and the close button", async () => {
    const user = userEvent.setup();
    render(<OperatorCopilotHost />);
    await openPanel(user);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    const dialog = await openPanel(user);
    await user.click(within(dialog).getByRole("button", { name: "Κλείσιμο" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with Enter and Space from the keyboard", async () => {
    const user = userEvent.setup();
    render(<OperatorCopilotHost />);
    const avatar = await screen.findByRole("button", { name: "Talia Operator Copilot" });

    avatar.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    screen.getByRole("button", { name: "Talia Operator Copilot" }).focus();
    await user.keyboard(" ");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("sends a message with hints only (never identity) and renders the reply", async () => {
    const user = userEvent.setup();
    render(<OperatorCopilotHost />);
    const dialog = await openPanel(user);
    expect(within(dialog).getByText(/Villa Aurora/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Μήνυμα προς Talia"), "status?");
    await user.click(within(dialog).getByRole("button", { name: "Αποστολή" }));

    expect(await within(dialog).findByText("Three arrivals today.")).toBeInTheDocument();

    const sendCall = adminFetch.mock.calls.find(([p]) =>
      String(p).endsWith("/messages"),
    )!;
    expect(sendCall[0]).toBe(`/copilot/conversations/${CONVERSATION_ID}/messages`);
    const body = JSON.parse((sendCall[1] as RequestInit).body as string);
    expect(body).toEqual({
      content: "status?",
      activePropertyId: "11111111-1111-4111-8111-111111111111",
      pageContext: { kind: "dashboard" },
    });
    expect(Object.keys(body)).not.toContain("tenantId");
    expect(Object.keys(body)).not.toContain("userId");
    expect(Object.keys(body)).not.toContain("role");

    // Conversation id is persisted per tenant+user for this browser session.
    expect(sessionStorage.getItem("talos.copilot.conversation.v1:tenant-1:user-1")).toBe(
      CONVERSATION_ID,
    );
  });

  it("shows an unread badge when a reply arrives while minimized", async () => {
    const user = userEvent.setup();
    const pending = deferred<ReturnType<typeof sendResult>>();
    adminFetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/copilot/conversations" && options?.method === "POST") {
        return { id: CONVERSATION_ID, status: "active" };
      }
      if (path.endsWith("/messages")) return pending.promise;
      throw new Error(`unexpected path ${path}`);
    });

    render(<OperatorCopilotHost />);
    const dialog = await openPanel(user);
    await user.type(within(dialog).getByLabelText("Μήνυμα προς Talia"), "status?");
    await user.click(within(dialog).getByRole("button", { name: "Αποστολή" }));
    await waitFor(() => expect(screen.getByTestId("copilot-thinking")).toBeInTheDocument());

    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("copilot-unread-badge")).toBeNull();

    await act(async () => {
      pending.resolve(sendResult("Late reply"));
    });

    const badge = await screen.findByTestId("copilot-unread-badge");
    expect(badge).toHaveTextContent("1");

    // Opening clears the badge and shows the reply.
    const reopened = await openPanel(user);
    expect(screen.queryByTestId("copilot-unread-badge")).toBeNull();
    expect(await within(reopened).findByText("Late reply")).toBeInTheDocument();
  });

  it("surfaces an error and keeps the draft when sending fails", async () => {
    const user = userEvent.setup();
    adminFetch.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/copilot/conversations" && options?.method === "POST") {
        return { id: CONVERSATION_ID, status: "active" };
      }
      throw new Error("network down");
    });

    render(<OperatorCopilotHost />);
    const dialog = await openPanel(user);
    const input = within(dialog).getByLabelText("Μήνυμα προς Talia");
    await user.type(input, "hello");
    await user.click(within(dialog).getByRole("button", { name: "Αποστολή" }));

    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(input).toHaveValue("hello");
  });

  it("New chat archives the current conversation and starts fresh", async () => {
    const user = userEvent.setup();
    render(<OperatorCopilotHost />);
    const dialog = await openPanel(user);
    await user.type(within(dialog).getByLabelText("Μήνυμα προς Talia"), "status?");
    await user.click(within(dialog).getByRole("button", { name: "Αποστολή" }));
    await within(dialog).findByText("Three arrivals today.");

    await user.click(within(dialog).getByRole("button", { name: "Νέα συνομιλία" }));

    await waitFor(() =>
      expect(
        adminFetch.mock.calls.some(
          ([p, o]) =>
            p === `/copilot/conversations/${CONVERSATION_ID}/archive` &&
            (o as RequestInit).method === "POST",
        ),
      ).toBe(true),
    );
    expect(within(dialog).queryByText("Three arrivals today.")).toBeNull();
    expect(sessionStorage.getItem("talos.copilot.conversation.v1:tenant-1:user-1")).toBeNull();
  });

  it("restores a persisted conversation when the panel opens", async () => {
    sessionStorage.setItem("talos.copilot.conversation.v1:tenant-1:user-1", CONVERSATION_ID);
    adminFetch.mockImplementation(async (path: string) => {
      if (path === `/copilot/conversations/${CONVERSATION_ID}`) {
        return {
          conversation: { id: CONVERSATION_ID, status: "active" },
          messages: [
            { id: "a", role: "operator", content: "earlier question", createdAt: "x" },
            { id: "b", role: "assistant", content: "earlier answer", createdAt: "y" },
          ],
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const user = userEvent.setup();
    render(<OperatorCopilotHost />);
    const dialog = await openPanel(user);
    expect(await within(dialog).findByText("earlier answer")).toBeInTheDocument();
    expect(within(dialog).getByText("earlier question")).toBeInTheDocument();
  });

  it("announces assistant replies through a polite live region", async () => {
    const user = userEvent.setup();
    render(<OperatorCopilotHost />);
    const dialog = await openPanel(user);
    const log = within(dialog).getByRole("log");
    expect(log).toHaveAttribute("aria-live", "polite");
  });
});
