# SimpleKubernetesDemoApp

A simple two-microservice demo app for learning Kubernetes and AKS. The solution consists of a React frontend and a .NET 8 Web API backend, wired together with Docker Compose for local development and Kubernetes manifests for cluster deployment.

## Project Structure

```
SimpleKubernetesDemoApp/
├── docker-compose.yml
├── backend/                        .NET 8 Web API
│   ├── Controllers/ItemsController.cs
│   ├── Models/Item.cs
│   ├── Repositories/ItemRepository.cs   (in-memory fake data)
│   └── Dockerfile
├── frontend/                       React (Vite) + nginx
│   ├── src/App.jsx
│   ├── nginx.conf                  proxies /api/* → backend
│   └── Dockerfile
└── resources/                      Kubernetes manifests
    ├── backend-deployment.yaml
    ├── backend-service.yaml
    ├── frontend-deployment.yaml
    ├── frontend-service.yaml
    └── ingress.yaml
```

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Docker Desktop | 4.x | Required for Docker Compose and local K8s |
| .NET SDK | 8.0 | Only needed for running the backend outside Docker |
| Node.js | 20.x | Only needed for running the frontend outside Docker |
| kubectl | 1.28+ | Required for Kubernetes deployment |

---

## Running with Docker Compose

This is the fastest way to get both services running locally. Docker handles all builds — no SDK or Node.js install required.

```bash
docker compose up --build -d
```

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost:3000        |
| Backend  | http://localhost:8080/items  |

To stop and remove containers:

```bash
docker compose down
```

---

## Running with Kubernetes

### 1. Build the images locally

Kubernetes needs the images available before applying the manifests. The manifests use `imagePullPolicy: IfNotPresent`, so locally-built images are used without pushing to a registry.

```bash
docker build -t simple-kube-demo-backend:latest ./backend
docker build -t simple-kube-demo-frontend:latest ./frontend
```

### 2. Apply the manifests

```bash
kubectl apply -f resources/
```

### 3. Verify the pods are running

```bash
kubectl get pods
kubectl get services
```

### 4. Access the app

The frontend is exposed via the Azure Web App Routing ingress controller. Retrieve the external IP assigned to the ingress:

```bash
kubectl get ingress
```

| Service  | URL                                        |
|----------|--------------------------------------------|
| Frontend | http://\<EXTERNAL-IP\> (from ingress above) |

### Tearing down

```bash
kubectl delete -f resources/
```

---

## Running locally without Docker

### Backend

```bash
cd backend
dotnet run
# Listening on http://localhost:5000 by default
```

Available endpoints:

| Method | Path              | Description        |
|--------|-------------------|--------------------|
| GET    | /items            | Return all items   |
| GET    | /items/{id}       | Return one item    |

### Frontend

```bash
cd frontend
npm install
npm run dev
# Vite dev server on http://localhost:5173
```

> **Note:** When running the frontend with `npm run dev`, the Vite dev server does not use `nginx.conf`, so `/api/` requests will not be proxied automatically. Either run the backend separately and add a proxy entry to `vite.config.js`, or use Docker Compose for a fully wired local environment.

---

## How the proxy works

The frontend nginx config proxies any request to `/api/*` through to the backend, stripping the `/api/` prefix:

```
Browser → GET /api/items
       → nginx → GET http://backend:8080/items
                       ↑
                 service name resolves in both
                 Docker Compose and Kubernetes
```

This means the same frontend build works in both environments without any environment variable changes.

---

## Next steps for AKS

1. Push images to a container registry (Azure Container Registry or Docker Hub):
   ```bash
   docker tag simple-kube-demo-backend:latest <your-registry>/simple-kube-demo-backend:latest
   docker push <your-registry>/simple-kube-demo-backend:latest

   docker tag simple-kube-demo-frontend:latest <your-registry>/simple-kube-demo-frontend:latest
   docker push <your-registry>/simple-kube-demo-frontend:latest
   ```

2. Update the `image:` field in `resources/backend-deployment.yaml` and `resources/frontend-deployment.yaml` to point to your registry.

3. Ensure the AKS cluster has the **Web App Routing** add-on enabled (required for the ingress to function):
   ```bash
   az aks addon enable --resource-group <rg> --name <cluster> --addon web_application_routing
   ```

4. Apply to your AKS cluster:
   ```bash
   az aks get-credentials --resource-group <rg> --name <cluster>
   kubectl apply -f resources/
   ```

> **Want a step-by-step walkthrough?** A full tutorial covering local development through AKS deployment is available in [Tutorial.md](Tutorial.md).

---

## Authorship & License

This project was entirely written by [Claude Code](https://claude.ai/code), Anthropic's AI coding assistant. No human authored any of the source code, configuration, or documentation.

The [Tutorial.md](Tutorial.md) was authored by [GitHub Copilot](https://github.com/features/copilot) (Claude Sonnet 4.6).

This software is provided under the MIT License (see [LICENSE](LICENSE)). As stated there, the software is provided **"as is", without warranty of any kind**, express or implied — including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. The authors and copyright holders accept no liability for any claim, damages, or other liability arising from the use or misuse of this code. You are free to use, copy, modify, merge, publish, distribute, sublicense, or sell this software without restriction.
