# Supersocket

Secure and stable websocket implementation

## Features

- Drop in replacement of native Websocket implementation (same API)
- Works in Node js and Web
- Can manage heavy sized messaged
- Authentication and encryption
- Handle connection timeouts
- Offline mode
- Retries and message order consistency

## Quick start

Using Yarn

```sh
yarn add @shippr/supersocket
```

Using NPM

```sh
npm install @shippr/supersocket
```

## Authentication

```js
import supersocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  authenticate: {
    endpoint: "/api/ws/auth",
  },
});
```

## Forwarding

```js
import supersocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  forwardOptions: {
    onMessage: "/api/ws/message",
  },
});
```

## Offline

```js
import supersocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  offline: true,
});
```

## Chunk messages

```js
import supersocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  //will split the message into 10kb chunks
  chunkSize: 10,
});
```

## Options

```js
export type SuperSocketOptions = {
  /**
   * Delay used in millisecond to reconnect after last try
   * @default 1000
   */
  reconnectDelay?: number,
  /**
   * In milliseconds, triggers a timeout error
   * @default 10000
   */
  connectionTimeout?: number,
  /**
   * In milliseconds, triggers a timeout error
   * @default 10
   */
  maxRetries?: number,
  /**
   * Add debus lines when set to true
   * @default false
   */
  debug?: boolean,
  /**
   * Will not reconnect after drop if set to true
   * @default false
   */
  disableReconnect?: boolean,
  /**
   * Split data string into chunks of X Kb
   * Warning: need to reconstruct when onmessage
   * @default undefined
   */
  chunkSize?: number,
  /**
   * Query params attached to base URL
   * ex { foo: bar } => wss://mysocket.com/?foo=bar
   * @default undefined
   */
  queryParams?: any,
  /**
   * Warning: Prevent non secured (ws://) traffic to go through
   * @default true
   */
  secureOnly?: boolean,
  /**
   * Forward websocket events to API route
   * @default undefined
   */
  forwardOptions?: {
    /**
     * Forward (POST) onmessage() to API route
     * ex: '/api/ws/message'
     * @default undefined
     */
    onMessage?: string,
    /**
     * Forward (POST) onerror() to API route
     * ex: '/api/ws/error'
     * @default undefined
     */
    onError?: string,
    /**
     * Adds extra-headers to POST call
     * @default undefined
     */
    headers?: any,
  },
  /**
   * Authentication middleware
   * connects if 200 return otherwhise
   * @default undefined
   */
  authenticate?: SuperSocketAuth,
  offline?: boolean,
};
```
