# SimpleKubernetesDemoApp — AKS Deployment Tutorial

This tutorial walks you step-by-step from running the app locally all the way to a production-ready Kubernetes deployment on Azure Kubernetes Service with auto-scaling.

## Variables used throughout this tutorial

Define these once in your terminal session so every command below works without substitution:

```powershell
$ACR_NAME    = "simplekubedemo"       # Must be globally unique, 5-50 chars, lowercase alphanumeric only
$RG          = "rg-simplekubedemo"
$LOCATION    = "eastus"
$CLUSTER     = "aks-simplekubedemo"
$K8S_VERSION = "1.29"
```

> **Tip:** ACR names become the subdomain of your login server (`<ACR_NAME>.azurecr.io`). If the name is taken, append a short random suffix — e.g. `simplekubedemo42`.

---

# Step 1 - Run the App Locally

In this step you will verify that both services build and run correctly on your machine before touching any cloud infrastructure.

## Concept/Pattern 1 - Local-First Development

This is necessary because containers that are broken locally will also be broken in the cloud — and debugging locally is dramatically faster and free. Confirming a green local run is your baseline.

1. Review the [README.md](README.md) for all prerequisites and detailed local-run instructions. The key tools you need are **Docker Desktop**, **kubectl**, and the **Azure CLI**.

2. Start both services with a single Docker Compose command:

    ```bash
    docker compose up --build -d
    ```

3. Confirm both services are healthy:

    ```bash
    docker compose ps
    ```

    You should see both `backend` and `frontend` with status `Up`.

4. Open your browser and navigate to:

    | Service  | URL                         |
    |----------|-----------------------------|
    | Frontend | http://localhost:3000       |
    | Backend  | http://localhost:8080/items |

5. Stop and clean up before moving on:

    ```bash
    docker compose down
    ```

> **If something is broken:** fix it now. Every subsequent step builds on working container images.

---

# Step 2 - Create an Azure Container Registry and Push the Images

In this step you will create a private Azure Container Registry (ACR), build both Docker images, tag them for the registry, and push them so AKS can pull them later.

## Concept/Pattern 1 - Private Container Registries

This is necessary because Kubernetes needs to pull images from *somewhere* at deployment time. Using a public registry like Docker Hub works, but a private Azure Container Registry keeps your images inside your Azure tenant, enables managed-identity authentication (no passwords), and gives you geo-replication and vulnerability scanning.

## Concept/Pattern 2 - Tag Conventions

This is important because a Docker image tag is how both humans and Kubernetes identify a specific version of a container. Using `latest` is convenient during development but ambiguous in production — a tag like `v1.0.0` or a Git commit SHA makes deployments reproducible and rollbacks deterministic.

1. Log in to Azure (skip if already logged in):

    ```powershell
    az login
    ```

2. Create a resource group:

    ```powershell
    az group create --name $RG --location $LOCATION
    ```

3. Create the Azure Container Registry with the Basic SKU (sufficient for learning):

    ```powershell
    az acr create `
      --resource-group $RG `
      --name $ACR_NAME `
      --sku Basic `
      --admin-enabled false
    ```

    > The `--admin-enabled false` flag keeps authentication managed-identity based. The AKS cluster will be granted pull access via RBAC in Step 3, so you will never need the admin password.

4. Log in to the registry so Docker can push to it:

    ```powershell
    az acr login --name $ACR_NAME
    ```

5. Build and tag both images pointing at your ACR login server. Run these from the repository root:

    ```powershell
    # Backend
    docker build -t "$ACR_NAME.azurecr.io/simple-kube-demo-backend:v1.0.0" ./backend

    # Frontend
    docker build -t "$ACR_NAME.azurecr.io/simple-kube-demo-frontend:v1.0.0" ./frontend
    ```

6. Push both images:

    ```powershell
    docker push "$ACR_NAME.azurecr.io/simple-kube-demo-backend:v1.0.0"
    docker push "$ACR_NAME.azurecr.io/simple-kube-demo-frontend:v1.0.0"
    ```

7. Verify the images are in the registry:

    ```powershell
    az acr repository list --name $ACR_NAME --output table
    ```

    You should see both `simple-kube-demo-backend` and `simple-kube-demo-frontend` listed.

    To inspect the available tags on a repository:

    ```powershell
    az acr repository show-tags `
      --name $ACR_NAME `
      --repository simple-kube-demo-backend `
      --output table
    ```

---

# Step 3 - Create an AKS Cluster Attached to the Container Registry

In this step you will provision an AKS cluster and wire it to your ACR so Kubernetes can pull your images without any manual credential management.

## Concept/Pattern 1 - Managed Identity and ACR Integration

This is necessary because pods in AKS must authenticate to ACR to pull images at runtime. Manually managing registry credentials (Kubernetes `imagePullSecrets`) is fragile and a security risk. The `--attach-acr` flag instructs Azure to automatically assign the `AcrPull` role on your registry to the cluster's managed identity — meaning no secrets, no rotation, and no `imagePullSecrets` entries in your manifests.

## Concept/Pattern 2 - Node Pool Sizing

This is important because the VM size of your node pool determines available CPU and memory for all pods. For this demo, a single `Standard_D2s_v3` node (2 vCPU, 8 GB RAM) is plenty. In Step 5 and Step 6 you will scale the cluster, so keep at least 1 extra node worth of headroom in mind.

1. Create the AKS cluster. This typically takes 3–5 minutes:

    ```powershell
    az aks create `
      --resource-group $RG `
      --name $CLUSTER `
      --kubernetes-version $K8S_VERSION `
      --node-count 2 `
      --node-vm-size Standard_D2s_v3 `
      --attach-acr $ACR_NAME `
      --enable-managed-identity `
      --generate-ssh-keys
    ```

    > `--node-count 2` gives you two worker nodes, which is the minimum recommended for demonstrating scheduling behavior and pod distribution across nodes.

2. Download the cluster credentials and merge them into your local kubeconfig:

    ```powershell
    az aks get-credentials --resource-group $RG --name $CLUSTER
    ```

3. Confirm kubectl is talking to the right cluster and the nodes are `Ready`:

    ```powershell
    kubectl get nodes
    ```

    Expected output:

    ```
    NAME                                STATUS   ROLES   AGE     VERSION
    aks-nodepool1-XXXXXXXX-vmss000000   Ready    agent   2m      v1.29.x
    aks-nodepool1-XXXXXXXX-vmss000001   Ready    agent   2m      v1.29.x
    ```

4. Check what context kubectl is currently using if you work with multiple clusters:

    ```powershell
    kubectl config current-context
    ```

---

# Step 4 - Deploy to Kubernetes Using kubectl

In this step you will update the Kubernetes manifests to reference your ACR images, change the frontend service type so it gets a public IP, and apply everything to the cluster using `kubectl`.

## Concept/Pattern 1 - Declarative Configuration

This is necessary because Kubernetes is a *declarative* system — you describe the desired state in YAML and the control plane reconciles the actual state to match it. Running `kubectl apply -f resources/` is idempotent: run it once to create resources, run it again after a change to update only what changed.

## Concept/Pattern 2 - imagePullPolicy

This is important because `IfNotPresent` (the default in the manifests) tells Kubernetes "only pull the image if it is not already cached on the node." That is correct for local Docker Desktop development where you build images directly onto the node, but wrong for AKS where nodes start fresh and images must always be pulled from ACR. Setting `Always` ensures each new pod gets the exact image from the registry.

## Concept/Pattern 3 - Service Types

This is important because the manifest currently uses `NodePort`, which exposes the service on a static port of every node and is fine for local clusters. On AKS you want `LoadBalancer`, which provisions an Azure Load Balancer with a public IP so the app is reachable from the internet.

1. Open `resources/backend-deployment.yaml` and update the `image` and `imagePullPolicy` fields:

    ```yaml
    containers:
      - name: backend
        image: <ACR_NAME>.azurecr.io/simple-kube-demo-backend:v1.0.0
        imagePullPolicy: Always
    ```

    Replace `<ACR_NAME>` with your actual ACR name (e.g. `simplekubedemo`).

2. Open `resources/frontend-deployment.yaml` and apply the same change:

    ```yaml
    containers:
      - name: frontend
        image: <ACR_NAME>.azurecr.io/simple-kube-demo-frontend:v1.0.0
        imagePullPolicy: Always
    ```

3. Open `resources/frontend-service.yaml` and change the service type from `NodePort` to `LoadBalancer`, removing the `nodePort` line:

    ```yaml
    spec:
      type: LoadBalancer
      selector:
        app: frontend
      ports:
        - port: 80
          targetPort: 80
    ```

4. Apply all four manifests at once:

    ```powershell
    kubectl apply -f resources/
    ```

    Expected output:

    ```
    deployment.apps/backend created
    service/backend created
    deployment.apps/frontend created
    service/frontend created
    ```

5. Watch the pods start up (press `Ctrl+C` to exit the watch):

    ```powershell
    kubectl get pods --watch
    ```

    Wait until both pods show `Running` and `READY 1/1`.

6. Get the external IP assigned to the frontend service:

    ```powershell
    kubectl get service frontend
    ```

    Azure provisioning the load balancer takes 1–2 minutes. While it is pending you will see `<pending>` in the `EXTERNAL-IP` column. Run the command again until a real IP appears:

    ```
    NAME       TYPE           CLUSTER-IP    EXTERNAL-IP      PORT(S)        AGE
    frontend   LoadBalancer   10.0.73.210   20.84.XXX.XXX    80:30080/TCP   2m
    ```

7. Open your browser and navigate to `http://<EXTERNAL-IP>`. The React frontend should load and display items fetched from the backend.

8. Inspect the full cluster state at a glance:

    ```powershell
    kubectl get all
    ```

9. View logs from a running pod (substitute the actual pod name from `kubectl get pods`):

    ```powershell
    kubectl get pods
    kubectl logs <backend-pod-name>
    kubectl logs <frontend-pod-name>
    ```

10. Describe a pod for detailed event and scheduling information — useful for debugging:

    ```powershell
    kubectl describe pod <backend-pod-name>
    ```

---

# Step 5 - Scaling the Kubernetes Cluster

In this step you will scale pods horizontally to handle more load, observe how Kubernetes distributes work across nodes, and then update the manifests to keep the replica count as the declared source of truth.

## Concept/Pattern 1 - Pod Replicas vs Node Count

This is necessary to understand because these are two separate scaling axes. *Pod scaling* (replicas) adds more instances of your application container. *Node scaling* adds more virtual machines to the cluster. You scale pods frequently and cheaply; you scale nodes when your pods collectively need more CPU/RAM than the existing nodes can provide.

## Concept/Pattern 2 - Imperative vs Declarative Scaling

This is important because `kubectl scale` is *imperative* — it makes an immediate change but does not update your YAML files. If someone re-applies the manifests later, the replica count will revert. The correct long-term practice is to update the `replicas:` field in the YAML and commit that change so your Git repository is always the source of truth.

### Scaling Pods (Application Layer)

1. Scale the backend deployment to 3 replicas imperatively:

    ```powershell
    kubectl scale deployment backend --replicas=3
    ```

2. Watch the new pods come online:

    ```powershell
    kubectl get pods --watch
    ```

    You should see two new `backend` pods transition `Pending` → `ContainerCreating` → `Running`.

3. Verify which nodes the pods landed on — the scheduler distributes them across available nodes:

    ```powershell
    kubectl get pods -o wide
    ```

    The `NODE` column shows each pod's host node.

4. Now make this permanent by updating `resources/backend-deployment.yaml`:

    ```yaml
    spec:
      replicas: 3
    ```

5. Re-apply the manifest so the file and the cluster are in sync:

    ```powershell
    kubectl apply -f resources/backend-deployment.yaml
    ```

    Since the cluster already has 3 replicas, Kubernetes makes no change — this is the idempotency guarantee.

### Scaling Nodes (Infrastructure Layer)

6. Scale the underlying AKS node pool from 2 to 3 nodes when you need more physical capacity:

    ```powershell
    az aks scale `
      --resource-group $RG `
      --name $CLUSTER `
      --node-count 3 `
      --nodepool-name nodepool1
    ```

7. Confirm the new node is ready:

    ```powershell
    kubectl get nodes
    ```

8. Scale back down to 2 nodes when you are done (AKS will safely reschedule any pods that were on the removed node):

    ```powershell
    az aks scale `
      --resource-group $RG `
      --name $CLUSTER `
      --node-count 2 `
      --nodepool-name nodepool1
    ```

---

# Step 6 - Automatic Scaling with the Horizontal Pod Autoscaler

In this step you will configure Kubernetes to automatically scale your backend pods up and down based on CPU utilization — so the cluster reacts to real traffic without manual intervention.

## Concept/Pattern 1 - Horizontal Pod Autoscaler (HPA)

This is necessary because manually running `kubectl scale` to react to traffic spikes is not practical in production. The HPA controller watches a metrics feed and continuously reconciles the pod count to keep observed CPU usage near a target percentage. It scales *out* when load rises and *in* (after a cool-down period) when load drops.

## Concept/Pattern 2 - Resource Requests and Limits

This is important because the HPA calculates CPU utilization as a percentage of each pod's *requested* CPU. Without a `resources.requests.cpu` value in the deployment spec the HPA cannot compute utilization and will report `<unknown>` — and will refuse to scale. Resource limits also protect the node from a runaway pod consuming all available CPU.

## Concept/Pattern 3 - Metrics Server

This is necessary because the HPA consumes metrics from the Kubernetes Metrics Server. AKS ships with the Metrics Server pre-installed starting in Kubernetes 1.28 via the `metrics-server` add-on. If you are on an older cluster or a non-AKS distribution you may need to install it manually.

1. Verify the Metrics Server is running on your cluster:

    ```powershell
    kubectl get deployment metrics-server -n kube-system
    ```

    If it is not present, install it:

    ```powershell
    kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
    ```

2. Add CPU resource requests and limits to `resources/backend-deployment.yaml` so the HPA has a baseline to work from:

    ```yaml
    containers:
      - name: backend
        image: <ACR_NAME>.azurecr.io/simple-kube-demo-backend:v1.0.0
        imagePullPolicy: Always
        ports:
          - containerPort: 8080
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
    ```

    > CPU values use the millicores unit: `100m` = 0.1 of one vCPU core.

3. Apply the updated manifest to the cluster:

    ```powershell
    kubectl apply -f resources/backend-deployment.yaml
    ```

4. Create an HPA for the backend that targets 50% average CPU utilization, with a minimum of 1 replica and a maximum of 5:

    ```powershell
    kubectl autoscale deployment backend `
      --cpu-percent=50 `
      --min=1 `
      --max=5
    ```

5. Inspect the HPA. The `TARGETS` column shows `<current>/<desired>%`:

    ```powershell
    kubectl get hpa
    ```

    After a minute or two (once the Metrics Server collects data) `TARGETS` will show a real CPU percentage instead of `<unknown>`.

6. Simulate load against the backend to trigger a scale-out (run this in a separate terminal tab):

    ```powershell
    # Runs 200 concurrent requests in a tight loop for 60 seconds
    # Requires 'hey' load generator: https://github.com/rakyll/hey
    # Install with: go install github.com/rakyll/hey@latest
    $BACKEND_IP = kubectl get service backend -o jsonpath='{.spec.clusterIP}'
    hey -z 60s -c 50 "http://$BACKEND_IP:8080/items"
    ```

    If you do not have `hey`, use any load generator you prefer (e.g. `k6`, `wrk`, PowerShell `Invoke-WebRequest` in a loop).

7. In your primary terminal, watch the HPA and pods react to load:

    ```powershell
    kubectl get hpa --watch
    ```

    You should see the `REPLICAS` count climb toward the maximum as CPU rises above 50%, then slowly decrease after load stops (the default scale-in stabilization window is 5 minutes).

8. To make the HPA configuration part of your repository rather than an imperative command, save it as a manifest:

    ```powershell
    kubectl get hpa backend -o yaml | `
      Select-String -NotMatch "resourceVersion|uid|creationTimestamp|generation|status" | `
      Out-File resources/backend-hpa.yaml
    ```

    Or write `resources/backend-hpa.yaml` by hand:

    ```yaml
    apiVersion: autoscaling/v2
    kind: HorizontalPodAutoscaler
    metadata:
      name: backend
    spec:
      scaleTargetRef:
        apiVersion: apps/v1
        kind: Deployment
        name: backend
      minReplicas: 1
      maxReplicas: 5
      metrics:
        - type: Resource
          resource:
            name: cpu
            target:
              type: Utilization
              averageUtilization: 50
    ```

    Apply it:

    ```powershell
    kubectl apply -f resources/backend-hpa.yaml
    ```

9. Delete the HPA when you are done experimenting:

    ```powershell
    kubectl delete hpa backend
    ```

---

## Tearing Everything Down

When you are finished with the tutorial, clean up all Azure resources to avoid ongoing charges:

```powershell
# Delete just the Kubernetes workloads (keeps the cluster)
kubectl delete -f resources/

# Delete the entire resource group — removes the AKS cluster, ACR, and all associated resources
az group delete --name $RG --yes --no-wait
```

> The `--no-wait` flag returns your terminal immediately while Azure deletes everything in the background. Deletion typically completes in 5–10 minutes.
