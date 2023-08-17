/* WebSocket does not exist natively in node */
export default typeof WebSocket === "undefined" ? require("ws") : WebSocket;
