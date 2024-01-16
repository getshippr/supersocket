import WebSocket from "ws";
import ws from "./client";
import { CloseEvent, ErrorEvent, Event } from "./types/events";
import defaultOptions, {
  SuperSocketAuth,
  SuperSocketOptions,
} from "./types/supersocket";
import { AES, enc } from "crypto-js";
import { Buffer } from "buffer";

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
   * Timer used for reconnection
   */
  private _pingInterval: NodeJS.Timer | undefined = undefined;
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
   * current timestamp
   */
  private _timestamp: number | undefined = undefined;

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

  /**
   * Debug
   */
  private _debug(log: string, data?: any) {
    if (this._options.debug) {
      const current = Date.now();
      console.debug(
        `[${
          this._timestamp === undefined
            ? "start"
            : `${current - this._timestamp}ms`
        }] `,
        log,
        data || ""
      );
      this._timestamp = current;
    }
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
      this._debug("authenticating users before opening socket");
      this._authenticate(this._options.authenticate)
        .then((res) => {
          this._debug("authentication answer", res);
          if (res && res.status !== 200) {
            console.error(res, "user unauthorized");
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
   * returns websocket client
   */
  get client() {
    return this._client;
  }

  /**
   * Current retry
   */
  get totalRetry() {
    return this._totalRetry;
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
  public connect(): void {
    return this._connect();
  }
  /**
   * Called on close event
   */
  public close(): void {
    return this._disconnect();
  }
  /**
   * Called on close event
   */
  public onopen: ((event: Event) => void) | null = null;
  /**
   * Triggers when onmessage event
   */
  public onmessage: ((event: WebSocket.MessageEvent) => void) | null = null;
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
   * Encrypts message if encryptKey provided
   */
  public send(data: Object) {
    this._debug(`sending message`, data);
    if (this._client && this._client.readyState === 1) {
      let str = JSON.stringify(data);
      if (this._options.encryptKey) {
        str = AES.encrypt(str, this._options.encryptKey).toString();
        this._debug(`message encrypted to`, str);
      }
      const sizeInBytes = Buffer.from(str).length;
      const sizeInKB = sizeInBytes / 1024;
      if (
        !this._options.chunkSize ||
        (this._options.chunkSize && this._options.chunkSize >= sizeInKB)
      ) {
        this._client.send(str);
      } else {
        const chunkId = `chunk-${Date.now()}`;
        const chunks = this._splitStringBySize(str, this._options.chunkSize);
        const nbChunks = chunks.length;
        chunks.forEach((chunk, index) => {
          this._client?.send(
            JSON.stringify({ chunk, index, chunkId, nbChunks })
          );
        });
      }
    } else {
      this._debug(`socket disconnected, queuing incomming messages`);
      if (this._options.offline) {
        this._queue.push({ data, timestamp: Date.now() });
        this._debug(`in queue ${this._queue.length}`);
      }
    }
  }

  /**
   * Handles websocket connection
   */
  private _connect = () => {
    this._debug(
      `connecting to ${this._url} (${
        /wss/.test(this._url) ? "secured" : "unsecured"
      })`
    );
    if (!this._lockConnect) {
      this._totalRetry++;
      this._lockConnect = true;

      this._client = this._protocols?.length
        ? new ws(this._url, this._protocols)
        : new ws(this._url);

      this._debug(
        `instanciated websocket with status ${this._client?.readyState}`
      );
      this._addEventListeners();
      this._debug(`added event listeners`);

      setTimeout(() => {
        if (this._client?.readyState === 0 && !this._lockReConnect) {
          this._debug(
            `timeout reached (from options: ${this._options.connectionTimeout})`
          );
          //@ts-ignore
          clearInterval(this._reconnectInterval);
          //@ts-ignore
          clearInterval(this._pingInterval);
          const error = new ErrorEvent(new Error("timeout"), null);
          this._onError(error);
        }
      }, this._options.connectionTimeout);

      this._pingInterval = setInterval(() => {
        if (this._client?.readyState === 1) {
          this._debug(`sending ping to server to keep alive`);
          this._client?.send(JSON.stringify({ type: "ping" }));
        }
      }, this._options.pingInterval);
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

    //@ts-ignore
    clearInterval(this._reconnectInterval);

    if (this._queue.length) {
      this._debug(`queue not empty, processing it`);
      const queue = this._queue.sort((a, b) => {
        return a.timestamp > b.timestamp ? 1 : -1;
      });
      queue.forEach((m) => {
        this.send(m.data);
      });
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
    this._debug(`setting reconnect interval`);
    //@ts-ignore
    this._reconnectInterval = setInterval(() => {
      if (this._totalRetry <= (this._options.maxRetries || 0)) {
        this._debug(`new attempt (total: ${this._totalRetry})`);
        this._connect();
      } else {
        this._debug(`limit retries reached (${this._options.maxRetries})`);

        //@ts-ignore
        clearInterval(this._reconnectInterval);
        //@ts-ignore
        clearInterval(this._pingInterval);
      }
    }, this._options.reconnectDelay);
  };

  /**
   * on close handler
   */
  private _onclose = (event: CloseEvent) => {
    this._lockConnect = false;
    if (this.onclose) {
      this.onclose(event);
    }
    if (
      !this._options.disableReconnect &&
      !this._lockReConnect &&
      this._client?.readyState === 3
    ) {
      this._lockReConnect = true;
      this._debug(`starting reconnect after closing`);
      this._reconnect();
    }
  };

  /**
   * on message handler
   */
  private _onmessage = (event: WebSocket.MessageEvent) => {
    this._debug(`message received`, event.data);
    const forward = this._options.forwardOptions;
    let data: string = `${event.data}`;
    if (this._options.encryptKey) {
      this._debug(`message to be decrypted (AES)`);
      const bytes = AES.decrypt(`${event.data}`, this._options.encryptKey);
      data = bytes.toString(enc.Utf8);
      this._debug(`message decrypted`);
    }
    if (forward && forward.onMessage) {
      this._debug(`message to be forwarded to ${forward.onMessage}`);
      let headers: any = {};

      if (forward.headers) {
        headers = { ...forward.headers };
      }
      try {
        fetch(forward.onMessage, {
          headers,
          method: "POST",
          body: data,
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
    this._debug(`error state in connection, will disconnect`, event.message);
    this._lockConnect = false;
    this._disconnect(undefined, event.message);
    const forward = this._options.forwardOptions;
    if (forward && forward.onError) {
      this._debug(`fowarding error to ${forward.onError}`);

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
      this._debug(`starting reconnect after error`);
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
    this._debug(`disconnecting client`);
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
