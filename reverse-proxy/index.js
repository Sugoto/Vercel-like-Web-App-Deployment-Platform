const express = require("express");
const httpProxy = require("http-proxy");

const app = express();
const PORT = 8000;

// app.get("/", (req, res) => {
//   res.send("This is the Verse Reverse Proxy");
// });


const BASE_PATH =
  "https://verse-outputs.s3.ap-south-1.amazonaws.com/__outputs";

const proxy = httpProxy.createProxy();

app.use((req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split(".")[0];

  // Custom Domain - DB Query

  const resolvesTo = `${BASE_PATH}/${subdomain}`;

  return proxy.web(req, res, { target: resolvesTo, changeOrigin: true });
});

proxy.on("proxyReq", (proxyReq, req, res) => {
  const url = req.url;
  if (url === "/") proxyReq.path += "index.html";
});

// Start the server
app.listen(PORT, () => console.log(`Reverse Proxy Running..${PORT}`));
