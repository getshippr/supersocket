# Shippr

Welcome! Shippr provides toolkits to build realtime features in no time.

## Features

- Minimal HTTP client to interact with Shippr's API
- Works both on the browser and node.js
- Built with TypeScript

## Quick start

Using Yarn

```sh
yarn add @shippr/client
```

Using NPM

```sh
npm install @shippr/client
```

Create a simple pub/sub

```js
import shippr from "@shippr/client";

//pub
const client = shippr("APPID", "APIKEY");
client.publish("my-shared-channel", { data: "something happened" });

//sub
const myWatcher = await client.subscribe("my-shared-channel");
myWatcher.on((data, err) => {
  doSomethingFun();
});
```

## Documentation

Full documentation (generated via [Mintlify](https://mintlify.com/))
