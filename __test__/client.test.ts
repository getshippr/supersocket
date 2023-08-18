import { describe, expect, test } from "@jest/globals";
import SuperSocket from "../client";
import { WebSocket, Server } from "mock-socket";
import fetch from "jest-fetch-mock";
fetch.enableMocks();
let mockServer = new Server("wss://localhost:1234");

beforeEach(() => {
  global.WebSocket = WebSocket;
  fetch.resetMocks();
});

describe("SuperSocket instantiation", () => {
  test("should fail if wrong URL", () => {
    const ws = new SuperSocket("fake url");
    expect(ws.readyState).toBe(undefined);
  });

  test("should fail if non secured protocol", () => {
    const ws = new SuperSocket("ws://localhost:1234");
    expect(ws.readyState).toBe(undefined);
  });

  test("should be allowed if non secured protocol and secureOnly set to false ", () => {
    const ws = new SuperSocket("ws://localhost:1234", [], {
      secureOnly: false,
    });
    expect(ws.readyState).not.toBe(undefined);
  });

  test("should be allowed with secured traffic", () => {
    const ws = new SuperSocket("wss://localhost:1234");
    expect(ws.readyState).toBe(0);
  });

  test("should be unauthorised if auth throws exception", () => {
    fetch.mockImplementationOnce(() => Promise.reject("User Not Allowed"));
    const ws = new SuperSocket("wss://localhost:1234", [], {
      authenticate: {
        endpoint: "/ws/auth",
      },
    });
    expect(ws.readyState).toBe(undefined);
  });

  test("should be unauthorised if user not allowed", () => {
    //@ts-ignore
    fetch.mockImplementationOnce(() => Promise.resolve({ status: 401 }));
    const ws = new SuperSocket("wss://localhost:1234", [], {
      authenticate: {
        endpoint: "/ws/auth",
      },
    });
    expect(ws.readyState).toBe(undefined);
  });

  test("should be connect if user allowed", async () => {
    //@ts-ignore
    fetch.mockImplementationOnce(() => Promise.resolve({ status: 200 }));
    const ws = new SuperSocket("wss://localhost:1234", [], {
      authenticate: {
        endpoint: "/ws/auth",
      },
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(ws.readyState).not.toBe(undefined);
  });
});

describe("SuperSocket instantiated, it should", () => {
  test("return the computed url", () => {
    const ws = new SuperSocket("wss://localhost:1234", [], {
      queryParams: {
        foo: "bar",
      },
    });
    expect(ws.url).not.toBe("wss://localhost:1234/?foo=bar");
  });
  test("listen to events", () => {
    const ws = new SuperSocket("wss://localhost:1234");
    ws.onopen = (event) => {
      expect(event).not.toBe(undefined);
    };
  });
  test("listen to forward message if forwardOptions.onMessage setup", () => {
    const ws = new SuperSocket("wss://localhost:1234", [], {
      forwardOptions: {
        onMessage: "/ws/message",
      },
    });
    expect(fetch).toBeCalled();
  });
  test("listen to forward error if forwardOptions.onError setup", () => {
    const ws = new SuperSocket("wss://localhost:1234", [], {
      forwardOptions: {
        onError: "/ws/error",
      },
    });
    expect(fetch).toBeCalled();
  });
  test("should listen to error", () => {
    mockServer.on("connection", (x) => {
      //@ts-ignore
      x.dispatchEvent({ type: "error" });
    });
    const ws = new SuperSocket("wss://localhost:1234");
    ws.onerror = (event) => {
      expect(event).not.toBe(undefined);
    };
  });
  test("should retry on error", async () => {
    mockServer.on("connection", (x) => {
      //@ts-ignore
      x.dispatchEvent({ type: "error" });
    });
    const ws = new SuperSocket("wss://localhost:1234");
    await new Promise((r) => setTimeout(r, 300));
    expect(ws.totalRetry).toBeGreaterThan(0);
  });
  test("should retry on error up to maxRetry", async () => {
    mockServer.on("connection", (x) => {
      //@ts-ignore
      x.dispatchEvent({ type: "error" });
    });
    const ws = new SuperSocket("wss://localhost:1234", [], {
      maxRetries: 1,
    });
    await new Promise((r) => setTimeout(r, 1000));
    expect(ws.totalRetry).toBeLessThan(2);
  });
  test("should close current connection on error", async () => {
    mockServer.on("connection", (x) => {
      //@ts-ignore
      x.dispatchEvent({ type: "error" });
    });
    const ws = new SuperSocket("wss://localhost:1234");
    ws.onclose = (event) => {
      expect(event).not.toBe(undefined);
      expect(ws.readyState).toBeGreaterThan(1);
    };
  });
});
