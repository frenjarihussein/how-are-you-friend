import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

async function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  // RouterProvider paints nothing until the router load resolves; in jsdom the
  // implicit effect-driven load never settles, so load explicitly.
  await router.load();
  // The root shell renders a full <html> document, which jsdom only accepts
  // when mounted into the document body itself.
  return render(<RouterProvider router={router} />, {
    container: document.body,
    baseElement: document.body,
  });
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

// Assert only that the router mounts and paints, never page content:
// routes are rewritten as the app is built and this must keep passing.
describe("App routing", () => {
  it("renders the index route", async () => {
    renderAt("/");

    await waitFor(() => expect(document.body.querySelector("h1")).not.toBeNull());
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    renderAt("/this-route-does-not-exist");

    await waitFor(() => expect(document.body.querySelector("h1")).not.toBeNull());
  });
});
