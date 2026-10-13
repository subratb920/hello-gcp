// A tiny test app for Continuum Deploy on Google Cloud (GKE). No dependencies.
// It confirms the deployment and shows where it runs, read at start-up from
// Google's metadata server and Kubernetes (nothing is configured by hand).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { hostname, totalmem } from "node:os";

const port = Number(process.env.PORT) || 3000;
const startedAt = new Date();
let served = 0;

/** One value from Google's metadata server (answers only inside Google Cloud). */
async function metadata(path) {
  try {
    const res = await fetch(`http://metadata.google.internal/computeMetadata/v1/${path}`, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? (await res.text()).trim() : null;
  } catch {
    return null; // not on Google Cloud (e.g. running locally)
  }
}

async function readOr(file, fallback) {
  try {
    return (await readFile(file, "utf8")).trim();
  } catch {
    return fallback;
  }
}

// Where it runs, looked up once
const where = await (async () => {
  const [project, cluster, zone, location, namespace] = await Promise.all([
    metadata("project/project-id"),
    metadata("instance/attributes/cluster-name"),
    metadata("instance/zone"),
    metadata("instance/attributes/cluster-location"),
    readOr("/var/run/secrets/kubernetes.io/serviceaccount/namespace", null),
  ]);
  return {
    onGoogleCloud: Boolean(project),
    project,
    cluster,
    region: location,
    zone: zone ? zone.split("/").pop() : null,
    namespace,
    pod: hostname(),
  };
})();

function details(req) {
  const up = Math.round((Date.now() - startedAt.getTime()) / 1000);
  const mem = process.memoryUsage().rss;
  return {
    ...where,
    node: process.version,
    port,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: up,
    memoryMB: Math.round(mem / 1048576),
    machineMemoryMB: Math.round(totalmem() / 1048576),
    requestsServed: served,
    // Set by Google's load balancer when the request came through it
    viaGoogleLoadBalancer: /google/i.test(String(req.headers.via ?? "")),
    clientIp: String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim(),
    host: req.headers.host ?? null,
  };
}

const esc = (v) => String(v ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function page(d) {
  const rows = [
    ["Google Cloud project", d.project],
    ["Cluster", d.cluster],
    ["Region", d.region],
    ["Zone of this copy", d.zone],
    ["Namespace (Continuum project)", d.namespace],
    ["Pod (this copy)", d.pod],
    ["Served through Google's load balancer", d.viaGoogleLoadBalancer ? "yes" : "no"],
    ["Address you used", d.host],
    ["Running since", `${d.startedAt} (${d.uptimeSeconds} s)`],
    ["Requests served by this copy", d.requestsServed],
    ["Memory used", `${d.memoryMB} MB`],
    ["Node.js", d.node],
    ["Port", d.port],
  ];
  const ok = d.onGoogleCloud;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hello from Continuum Deploy on Google Cloud</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 44rem; margin: 3rem auto; padding: 0 1rem; color: #1f2937; }
  .ok { background: #e6f4ea; color: #1e6b34; border-radius: 8px; padding: 0.9rem 1rem; font-weight: 600; }
  .local { background: #f0f0f0; color: #555; border-radius: 8px; padding: 0.9rem 1rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.25rem; font-size: 0.95rem; }
  th, td { text-align: left; padding: 0.45rem 0.5rem; border-bottom: 1px solid #eee; vertical-align: top; }
  th { color: #6b7280; font-weight: 500; width: 45%; }
  footer { margin-top: 1.5rem; color: #6b7280; font-size: 0.85rem; }
  code { background: #f3f4f6; padding: 0 0.25rem; border-radius: 4px; }
</style></head>
<body>
  <h1>Hello from Continuum Deploy</h1>
  ${
    ok
      ? `<p class="ok">✓ Deployed on Google Cloud: running on Kubernetes (GKE) in project ${esc(d.project)}, cluster ${esc(d.cluster)}.</p>`
      : `<p class="local">Running outside Google Cloud (for example on your computer), so there are no Google Cloud details to show.</p>`
  }
  <table>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
  <footer>Reload a few times: with more than one copy running, the pod name changes as Google's load balancer spreads requests. JSON: <code>/info</code> · health: <code>/health</code></footer>
</body>
</html>`;
}

createServer((req, res) => {
  served++;
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", startedAt: startedAt.toISOString() }));
    return;
  }
  const d = details(req);
  if (req.url === "/info") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(d, null, 2));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(page(d));
}).listen(port, () => console.log(`hello-gcp listening on port ${port}${where.onGoogleCloud ? ` (project ${where.project}, cluster ${where.cluster})` : " (not on Google Cloud)"}`));
