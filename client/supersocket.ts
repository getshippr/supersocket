import WebSocket from "ws";
import ws from "./client";
import { CloseEvent, ErrorEvent, Event } from "./types/events";
import defaultOptions, {
  SuperSocketAuth,
  SuperSocketOptions,
} from "./types/supersocket";

export default class SuperSocket {
  /**
   * Store the websocket client
   */
  private _client?: WebSocket;

  /**
   * Contains the computed URL of the websocket string
   */
  private readonly _url: string = "";

  /**
   * List of protocols (only applied in front end environment)
   */
  private readonly _protocols?: string | string[];

  /**
   * Default options
   */
  private readonly _options: SuperSocketOptions;

  /**
   * Timer used for reconnection
   */
  private _reconnectInterval: NodeJS.Timer | undefined = undefined;
  /**
   * Prevents multiple connection if one is ongoing
   */
  private _lockConnect: boolean = false;
  /**
   * Prevents triggering reconnect timer onError when one reconnect time is already running
   */
  private _lockReConnect: boolean = false;
  /**
   * Current number of total retries
   */
  private _totalRetry: number = 0;
  /**
   * Queue used to store messages in case of connectivity drops
   */
  private _queue: { timestamp: number; data: Object }[] = [];

  /**
   * Call to authentication middleware
   */
  private _authenticate(authOptions: SuperSocketAuth) {
    return fetch(authOptions.endpoint, {
      headers: authOptions.headers || {},
      method: "POST",
      body: JSON.stringify(authOptions.data || {}),
    });
  }

  constructor(
    url: string,
    protocols?: string | string[],
    options: SuperSocketOptions = {}
  ) {
    this._options = Object.assign(defaultOptions, options);

    let valid: any = null;
    try {
      valid = new URL(url);
    } catch (e) {
      console.error("SuperSocket error: invalid base url");
      return;
    }

    if (this._options.secureOnly && valid.protocol !== "wss:") {
      console.error(
        "SuperSocket error: only secured protocol allowed. Set 'secured' to false to allow unsecure connection"
      );
      return;
    }

    let hostname = valid.origin;

    if (Object.keys(this._options.queryParams).length) {
      Object.keys(this._options.queryParams).forEach((p, i) => {
        hostname =
          hostname +
          `${i === 0 ? "?" : "&"}${p}=${this._options.queryParams[p]}`;
      });
    }

    this._url = hostname;
    this._protocols = protocols;

    if (this._options.authenticate) {
      this._authenticate(this._options.authenticate)
        .then((res) => {
          if (res && res.status !== 200) {
            console.error("user unauthorized");
          } else {
            this._connect();
          }
        })
        .catch((err) => {
          console.error("user unauthorized");
        });
    } else {
      this._connect();
    }
  }

  /**
   * URL computed by websocket
   */
  get url() {
    return this._url;
  }

  /**
   * State of websocket
   * 0: CONNECTING 1: OPEN 2: CLOSING 3: CLOSED
   */
  get readyState(): number | undefined {
    return this._client?.readyState;
  }

  /**
   * Trigger websocket connection
   */
  public connect: (() => void) | null = null;
  /**
   * Called on close event
   */
  public close: (() => void) | null = null;
  /**
   * Called on close event
   */
  public onopen: ((event: Event) => void) | null = null;
  /**
   * Triggers when onmessage event
   */
  public onmessage: ((event: Event) => void) | null = null;
  /**
   * Triggers when onclose event
   */
  public onclose: ((event: CloseEvent) => void) | null = null;
  /**
   * Triggers when onclose event
   */
  public onerror: ((event: ErrorEvent) => void) | null = null;

  /**
   * send message to websocket
   * Chunks message if chunkSize > 0
   */
  public send(data: Object) {
    if (this._client && this._client.readyState === 1) {
      const jsonString = JSON.stringify(data);
      const sizeInBytes = Buffer.from(jsonString).length;
      const sizeInKB = sizeInBytes / 1024;
      if (
        !this._options.chunkSize ||
        (this._options.chunkSize && this._options.chunkSize >= sizeInKB)
      ) {
        this._client.send(jsonString);
      } else {
        const chunkId = `chunk-${Date.now()}`;
        const chunks = this._splitStringBySize(
          jsonString,
          this._options.chunkSize
        );
        const nbChunks = chunks.length;
        chunks.forEach((chunk, index) => {
          this._client?.send(
            JSON.stringify({ chunk, index, chunkId, nbChunks })
          );
        });
      }
    } else {
      if (this._options.useQueueFallback) {
        this._queue.push({ data, timestamp: Date.now() });
      }
    }
  }

  /**
   * Handles websocket connection
   */
  private _connect = () => {
    if (!this._lockConnect) {
      this._totalRetry++;
      this._lockConnect = true;

      this._client = this._protocols?.length
        ? new ws(this._url, this._protocols)
        : new ws(this._url);

      this._addEventListeners();

      setTimeout(() => {
        if (this._client?.readyState === 0 && !this._lockReConnect) {
          clearInterval(this._reconnectInterval);
          const error = new ErrorEvent(new Error("timeout"), null);
          this._onError(error);
        }
      }, this._options.connectionTimeout);
    }
  };

  /**
   * split string by size into chuncks (in kb)
   */
  private _splitStringBySize(inputString: string, maxSizeInKB: number) {
    const maxSizeInBytes = maxSizeInKB * 1024;
    const chunks: string[] = [];

    for (let i = 0; i < inputString.length; i += maxSizeInBytes) {
      const chunk = inputString.substr(i, maxSizeInBytes);
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * on open handler
   */
  private _onopen = (event: Event) => {
    this._lockConnect = false;
    this._lockReConnect = false;
    this._totalRetry = 0;

    clearInterval(this._reconnectInterval);

    if (this._queue.length) {
      const queue = this._queue.sort((a, b) => {
        return a.timestamp > b.timestamp ? 1 : -1;
      });
      queue.forEach((m) => this.send(m.data));
      this._queue = [];
    }

    if (this.onopen) {
      this.onopen(event);
    }
  };

  /**
   * on reconnect handler
   */
  private _reconnect = () => {
    this._lockConnect = false;
    this._reconnectInterval = setInterval(() => {
      if (this._totalRetry <= (this._options.maxRetries || 0)) {
        this._connect();
      } else {
        clearInterval(this._reconnectInterval);
      }
    }, 1000);
  };

  /**
   * on close handler
   */
  private _onclose = (event: CloseEvent) => {
    this._lockConnect = false;
    if (this.onclose) {
      this.onclose(event);
    }
  };

  /**
   * on message handler
   */
  private _onmessage = (event: WebSocket.MessageEvent) => {
    if (this._options.forwardOptions?.onMessage) {
      const forward = this._options.forwardOptions;
      let headers: any = {};

      if (forward.headers) {
        headers = { ...forward.headers };
      }
      try {
        fetch(forward.onMessage, {
          headers,
          method: "POST",
          body: `${event.data}`,
        });
      } catch (e) {
        const error = new ErrorEvent(
          new Error("cannot forward to route"),
          null
        );
        this._onError(error);
      }
    }
    if (this.onmessage) {
      this.onmessage(event);
    }
  };

  /**
   * on error handler
   */
  private _onError = (event: ErrorEvent) => {
    this._lockConnect = false;
    this._disconnect(undefined, event.message);
    if (this._options.forwardOptions?.onError) {
      const forward = this._options.forwardOptions;
      let headers: any = {};

      if (forward.headers) {
        headers = { ...forward.headers };
      }
      try {
        fetch(forward.onError, {
          headers,
          method: "POST",
          body: `${event.message}`,
        });
      } catch (e) {
        const error = new ErrorEvent(
          new Error("cannot forward error to route"),
          null
        );
        this._onError(error);
      }
    }
    if (
      this._options &&
      !this._options.disableReconnect &&
      !this._lockReConnect &&
      this._client?.readyState === 3
    ) {
      this._lockReConnect = true;
      this._reconnect();
    }
    if (this.onerror) {
      this.onerror(event);
    }
  };

  /**
   * on disconnect handler
   */
  private _disconnect(code = 1000, reason?: string) {
    if (!this._client) {
      return;
    }
    this._client.close(code, reason);
    this._onclose(new CloseEvent(code, reason, this));
  }

  /**
   * add event listener to socket
   */
  private _addEventListeners() {
    if (!this._client) {
      return;
    }
    this._client.addEventListener("open", this._onopen);
    this._client.addEventListener("close", this._onclose);
    this._client.addEventListener("message", this._onmessage);
    this._client.addEventListener("error", this._onError);
  }
}