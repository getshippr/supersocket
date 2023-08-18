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

## Quick start

```js
import SuperSocket from "@shippr/supersocket";

//old implementation
const ws = new WebSocket("wss://localhost:1234");

//new implementation
const ws = new SuperSocket("wss://localhost:1234");
```

## Authentication

```js
import SuperSocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  //prevents socket opening if endpoint returns something other than 200
  authenticate: {
    endpoint: "/your-auth-endpoint-api",
    headers: {
      "whatever bearer": value,
    },
    data: {
      foo: bar,
    },
  },
});
```

#### Example with cookie base authentication

```js
import SuperSocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  //prevents socket opening if endpoint returns something other than 200
  authenticate: {
    endpoint: "/your-auth-endpoint-api",
    headers: {
      "crsf cookie": value,
    },
  },
});
```

#### Example with credentials based authentication

```js
import SuperSocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  //prevents socket opening if endpoint returns something other than 200
  authenticate: {
    endpoint: "/your-auth-endpoint-api",
    data: {
      "client id": value,
      "client pwd": value,
    },
  },
});
```

## Forwarding

```js
import SuperSocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  forwardOptions: {
    onMessage: "/api/ws/message",
  },
});
```

## Offline

```js
import SuperSocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  //will queue messages and will process then when connection opens
  offline: true,
});
```

## Chunk messages

```js
import SuperSocket from "@shippr/supersocket";

const ws = new SuperSocket("wss://localhost:1234", [], {
  //will split the message into 10kb chunks
  chunkSize: 10,
});
ws.send({ ...myVeryBigJson });
```

## Options

```js
export type SuperSocketOptions = {
  reconnectDelay?: number,
  connectionTimeout?: number,
  maxRetries?: number,
  debug?: boolean,
  disableReconnect?: boolean,
  chunkSize?: number,
  queryParams?: any,
  secureOnly?: boolean,
  forwardOptions?: {
    onMessage?: string,
    onError?: string,
    headers?: any,
  },
  authenticate?: SuperSocketAuth,
  offline?: boolean,
};
```
