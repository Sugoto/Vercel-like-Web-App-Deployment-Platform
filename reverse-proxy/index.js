const express = require("express");
const httpProxy = require("http-proxy");

const app = express();
const PORT = process.env.PORT || 8000;

const BASE_PATH = "https://verse-outputs.s3.ap-south-1.amazonaws.com/__outputs";

const proxy = httpProxy.createProxy();

app.use((req, res, next) => {
  console.log("Received request for:", req.url);
  next();
});

app.use((req, res) => {
  const hostname = req.headers.host;
  const subdomain = hostname.split(".")[0];

  console.log("Hostname:", hostname);
  console.log("Subdomain:", subdomain);

  const resolvesTo = `${BASE_PATH}/${subdomain}`;

  return proxy.web(req, res, { target: resolvesTo, changeOrigin: true });
});

proxy.on("proxyReq", (proxyReq, req, res) => {
  const url = req.url;
  if (url === "/") proxyReq.path += "index.html";
});

proxy.on('error', function(err, req, res) {
  console.log('Error in proxying request:', err);
});

app.listen(PORT, () => console.log(`Reverse Proxy Running on port ${PORT}`));
