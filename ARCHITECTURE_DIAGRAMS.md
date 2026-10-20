# 🗺️ System & Architecture Diagrams

This file houses graphical Mermaid diagrams for `codendeploy`. Open this document in VS Code / IDE with a Markdown Preview extension (e.g. `Markdown Preview Mermaid Support`) to render them visually.

---

## 1. The Local Database Trap vs Global MCP Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer (Your Brother)
    participant Agent as Antigravity / Claude Code
    participant MCP as codendeploy MCP Server
    participant Vault as Global Machine Vault (~/.codendeploy/)
    participant Cloud as Cloud APIs (Supabase / GitHub / Vercel)

    Dev->>Agent: "Build me a plant nursery shop with database and auth"
    Agent->>MCP: call get_cloud_credentials(['supabase', 'github', 'vercel'])
    MCP->>Vault: Check global stored credentials
    Vault-->>MCP: Returns Supabase Service Key & DB URL
    MCP-->>Agent: Injects credentials directly into project .env
    Agent->>MCP: call verify_credentials('supabase')
    MCP->>Cloud: Pings Supabase API (HTTP GET /rest/v1/)
    Cloud-->>MCP: 200 OK (Connection Pool Healthy)
    MCP-->>Agent: Verified: true
    Agent->>Dev: "Cloud database verified and connected. Writing migrations now."
```

---

## 2. Global Plugin Vault vs Per-Project Scaffolding

```mermaid
flowchart TD
    subgraph GlobalVault["Developer's Machine (Configured Once)"]
        GlobalConfig["~/.gemini/config/ (Global Plugin / MCP)"]
        TokensVault["Stored Verified Keys (Supabase, Vercel, GitHub)"]
    end

    subgraph ProjectA["Brother's App 1: Habit Tracker"]
        AgentA["Antigravity / Claude Code"] -->|Calls MCP Tool| PluginCallA["codendeploy.setup_backend()"]
    end

    subgraph ProjectB["Brother's App 2: E-Commerce Store"]
        AgentB["Antigravity / Claude Code"] -->|Calls MCP Tool| PluginCallB["codendeploy.setup_backend()"]
    end

    PluginCallA --> GlobalConfig
    PluginCallB --> GlobalConfig
    GlobalConfig --> TokensVault
    TokensVault -->|Auto-injects real Cloud Postgres URL & Service Key| ProjectA
    TokensVault -->|Auto-injects real Cloud Postgres URL & Service Key| ProjectB
```

---

## 3. Local Machine vs Serverless Node.js vs Edge Isolates

```mermaid
flowchart TD
    subgraph Local["1. Local Machine Development"]
        LocalOS["Host OS (Windows / Linux)"] --> NodeExe["node.exe (Local Binary)"]
        NodeExe --> NextDev["npm run dev / next dev"]
        NextDev --> NodeHTTP["Native node:http Server"]
    end

    subgraph CloudNode["2. Production Serverless (Default: nodejs)"]
        VercelVM["Vercel / AWS Lambda Container"] --> CloudNodeRuntime["Pre-installed Node.js 20 Runtime"]
        CloudNodeRuntime --> APIRoute["app/api/.../route.ts"]
    end

    subgraph CloudEdge["3. Edge Runtime (runtime = 'edge')"]
        EdgeServer["Cloudflare / Vercel Edge PoP"] --> V8Isolate["V8 Isolate Engine (No Node.js)"]
        V8Isolate --> WebAPIs["Web Standards (fetch, Request, Response)"]
    end
```

---

## 4. NestJS Inversion of Control (IoC) & Dependency Injection Pipeline

```mermaid
classDiagram
    class AppModule {
        +imports: [AuthModule, BlueprintModule]
    }
    class BlueprintModule {
        +controllers: [BlueprintController]
        +providers: [BlueprintService, DatabasePool]
    }
    class BlueprintController {
        -blueprintService: BlueprintService
        +getBlueprint(id: string)
    }
    class BlueprintService {
        -db: DatabasePool
        +queryBlueprint(id: string)
    }
    AppModule --> BlueprintModule
    BlueprintModule --> BlueprintController
    BlueprintController --> BlueprintService : Injected via IoC
```

---

## 5. Zero-Node Bootstrap Tiers (No Host Runtime Required)

```mermaid
flowchart TD
    User["Developer Without Node.js"] --> Choices{How They Run It}

    Choices -->|Option 1: Single Native Binary| Binary["Download codendeploy.exe (Windows) / codendeploy (Linux)"]
    Binary --> EmbeddedV8["Embedded V8 + Libuv (Self-contained, 0 dependencies)"]
    EmbeddedV8 --> Execution["Runs CLI Engine Directly"]

    Choices -->|Option 2: 1-Line Shell Script| Script["irm https://codendeploy.dev/install.ps1 | iex"]
    Script --> DetectsNode{"Node Found on System?"}
    DetectsNode -->|No| AutoFetch["Downloads Hermetic Portable Node into ~/.codendeploy/bin/"]
    DetectsNode -->|Yes| UseSystem["Uses System Node"]
    AutoFetch --> Execution
    UseSystem --> Execution

    Choices -->|Option 3: Browser Web UI / Cloud| Cloud["Open https://codendeploy.dev"]
    Cloud --> Container["Docker Container / AWS Lambda (Node pre-baked in cloud)"]
    Container --> Execution
```

---

## 6. Express.js Under the Hood: The Single `stack` Array

```mermaid
flowchart TD
    subgraph ExpressInternal["app._router.stack (Array of Layer objects)"]
        Layer0["Layer 0: express.json() (app.use)"]
        Layer1["Layer 1: cors() (app.use)"]
        Layer2["Layer 2: Auth Middleware (app.use)"]
        Layer3["Layer 3: Route Handler GET /api/blueprints (app.get)"]
        Layer4["Layer 4: Global Error Handler (err, req, res, next)"]
    end

    IncomingRequest["Incoming HTTP Request"] --> Layer0
    Layer0 -->|calls next()| Layer1
    Layer1 -->|calls next()| Layer2
    Layer2 -->|calls next()| Layer3
    Layer3 -->|calls res.json()| SentResponse["TCP Socket Closed (Client gets data)"]
    Layer2 -.->|calls next(err) on bad token| Layer4
    Layer4 -->|calls res.status(500)| ErrorResponse["Error JSON sent to client"]
```

---

## 7. The Hybrid Headful Browser Key Harvester

```mermaid
sequenceDiagram
    autonumber
    actor Dev as User / Non-Tech Brother
    participant CLI as codendeploy CLI
    participant Browser as Visible Chrome Window (Playwright / Puppeteer)
    participant SaaS as GitHub / Supabase / Stripe Dashboard
    participant Env as Local .env File

    CLI->>Browser: Launches visible browser with user profile
    CLI->>Browser: Navigates to deep link (e.g. github.com/settings/tokens/new?scopes=repo)
    Browser->>SaaS: Loads Token Creation Form

    alt Needs 2FA / CAPTCHA
        SaaS-->>Browser: Prompts SMS / Passkey / Captcha
        CLI->>Dev: ⏸️ Paused: "Please solve 2FA/Captcha in the browser window..."
        Dev->>Browser: Solves Captcha / Enters OTP
    end

    CLI->>Browser: Clicks "Generate Token" button automatically
    Browser->>SaaS: Submits form
    SaaS-->>Browser: Renders newly generated plaintext key
    CLI->>Browser: Scrapes token from DOM (before user even sees it)
    CLI->>Env: Writes GITHUB_TOKEN=ghp_... directly into .env
    CLI->>Browser: Closes browser window
    CLI->>Dev: ✅ "Token captured & verified! Proceeding to next service..."
```

---

## 8. Google Stitch MCP Bridge & IPC Process Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / User
    participant Harvester as Harvester (127.0.0.1:4242)
    participant Env as .env File
    participant McpCfg as .agents/mcp_config.json
    participant IDE as Antigravity IDE Engine
    participant ChildProc as Stitch MCP Server (Node Subprocess)
    participant StitchAPI as stitch.withgoogle.com

    Dev->>Harvester: Pastes STITCH_API_KEY into Harvester UI
    Harvester->>StitchAPI: POST /api/v1/projects (Zero-Trust Latency Check)
    StitchAPI-->>Harvester: HTTP 200 OK
    Harvester->>Env: Appends STITCH_API_KEY=<token>
    Harvester->>McpCfg: Generates MCP server block ("stitch": npx -y @google/stitch-mcp)
    
    Note over IDE,ChildProc: Next Workspace Boot / Tool Initialization
    IDE->>McpCfg: Parses configured MCP servers
    IDE->>ChildProc: child_process.spawn("npx", ["-y", "@google/stitch-mcp"], { env })
    ChildProc-->>IDE: JSON-RPC 2.0 handshake via stdio pipes (tools/list)
    IDE->>ChildProc: {"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_screen"}}
    ChildProc->>StitchAPI: Authenticated API fetch
    StitchAPI-->>ChildProc: Design tokens & layout AST
    ChildProc-->>IDE: Returns structured UI context to Coding Agent
```

---

## 9. Key Audit, Harvester Decision, and Storage Pipeline

```mermaid
flowchart TD
    Start([User executes: npx codendeploy]) --> Blueprint[LLM generates ProjectBlueprint]
    Blueprint --> Audit[Credential Auditor: Reads process.env & local/global .env]
    
    Audit --> Verify{Run tokenVerifier on existing keys}
    
    Verify -->|All Required Keys Valid| SkipHarvester[SKIP HARVESTER: Log 'All keys verified on disk']
    Verify -->|1 or More Keys Missing / Invalid| LaunchHarvester[Filter Missing Keys -> Boot Harvester on 127.0.0.1:4242]
    
    LaunchHarvester --> OpenBrowser[Launch Everyday Browser: 127.0.0.1:4242]
    OpenBrowser --> UserPaste[User clicks deep link & pastes token]
    UserPaste --> LivePing[Harvester executes zero-trust live API ping]
    
    LivePing -->|Success| SaveStorage[Commit to Storage]
    LivePing -->|Fail| UserRetry[Display latency & error trace -> Retry]
    
    SaveStorage --> StoreTargetEnv[1. Write to Target Project: .env]
    SaveStorage --> StoreGlobalCache[2. Cache to Global Store: ~/.codendeploy/.env]
    SaveStorage --> StoreMcp[3. If Stitch/MCP -> Write .agents/mcp_config.json]
    
    StoreTargetEnv --> AllDone{All Required Keys Collected?}
    StoreGlobalCache --> AllDone
    StoreMcp --> AllDone
    
    AllDone -->|Yes| CloseHarvester[Shutdown loopback server 4242]
    AllDone -->|No| OpenBrowser
    
    SkipHarvester --> ScaffoldWorkspace[Proceed to Workspace Priming & GitHub Repo Creation]
    CloseHarvester --> ScaffoldWorkspace
```




