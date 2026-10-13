# hello-gcp

A tiny test app for Continuum Deploy on Google Cloud. No dependencies: `npm start` runs `server.js`, which answers on the port in `PORT` (Continuum sets 8080).

Its page confirms the deployment and shows where it runs, read at start-up from Google's metadata server and Kubernetes: project, cluster, region and zone, namespace (the Continuum project), pod (the copy that answered), whether the request came through Google's load balancer, uptime, requests served, memory.

- `/` — the confirmation page
- `/info` — the same details as JSON
- `/health` — `{ "status": "ok" }`

Run locally: `npm start`, then open http://localhost:3000 (it says it isn't on Google Cloud).
