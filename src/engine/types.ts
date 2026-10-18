export interface RequiredToken {
  id: string;
  name: string;
  envKey: string;
  service: 'github' | 'vercel' | 'supabase' | 'stripe' | 'resend' | 'gemini' | 'groq' | 'openai' | 'stitch' | 'custom';
  description: string;
  whyNeeded: string;
  deepLink: string;
  scopes?: string[];
  isProvided?: boolean;
  value?: string;
}

export interface ProjectCapabilities {
  needsAuth: boolean;
  needsDatabase: boolean;
  needsPayments: boolean;
  needsStorage: boolean;
  needsEmail: boolean;
  needsAI: boolean;
}

export interface ReferenceRepo {
  ownerRepo: string; // e.g. "pcottle/learnGitBranching"
  description: string;
  keyPatternsToExtract?: string[];
  branch?: string;
}

export interface ProjectBlueprint {
  projectName: string;
  category: 'ecommerce' | 'saas' | 'blog' | 'portfolio' | 'api' | 'fullstack-cms' | 'custom';
  tagline: string;
  plainEnglishSummary: string;
  coreFeatures: string[];
  capabilities: ProjectCapabilities;
  requiredTokens: RequiredToken[];
  referenceRepos?: ReferenceRepo[];
  recommendedStack: {
    framework: string;
    styling: string;
    database?: string;
    auth?: string;
    hosting: string;
  };
}

export interface VerificationResult {
  valid: boolean;
  service: 'github' | 'vercel' | 'supabase' | 'stripe' | 'resend' | 'gemini' | 'groq' | 'openai' | 'stitch' | string;

  identity?: string;
  scopes?: string[];
  error?: string;
  latencyMs: number;
}

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface TaskItem {
  id: string;
  name: string;
  status: StageStatus;
  detail?: string;
  link?: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  status: StageStatus;
  tasks: TaskItem[];
  startedAt?: string;
  completedAt?: string;
}

export interface ProjectState {
  projectName: string;
  targetDir: string;
  stages: PipelineStage[];
  repoUrl?: string;
  deployUrl?: string;
  lastUpdated: string;
}

export interface HostEnvironment {
  hasGit: boolean;
  hasGhCli: boolean;
  hasOpenCode: boolean;
  hasAider: boolean;
  preferredEditor?: 'vscode' | 'antigravity' | 'cursor' | 'terminal';
  editorCmd?: string;
}

export interface HandoffContext {
  projectName: string;
  blueprint: ProjectBlueprint;
  targetDir: string;
  strategy: 'clone_baseline' | 'scaffold_scratch';
  repoUrl?: string;
  verifiedEnvPath: string;
  tasks: TaskItem[];
}


