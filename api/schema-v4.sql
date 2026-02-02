-- Mission Control v4 Schema
-- Adds: Teams, Workspaces, Departments

-- Departments (top level)
CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🏢',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Teams (belong to department)
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    department_id TEXT REFERENCES departments(id),
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '👥',
    description TEXT,
    lead_agent_id TEXT REFERENCES agents(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workspaces (projects/clients)
CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    emoji TEXT DEFAULT '📁',
    description TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add team_id and workspace_id to agents
ALTER TABLE agents ADD COLUMN team_id TEXT REFERENCES teams(id);
ALTER TABLE agents ADD COLUMN department TEXT;

-- Add workspace_id to tasks
ALTER TABLE tasks ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);

-- Default data: Departments
INSERT INTO departments (id, name, emoji, description) VALUES
    ('content', 'Content', '✍️', 'Content creation and SEO'),
    ('tech', 'Technical', '💻', 'Development and DevOps'),
    ('growth', 'Growth', '📈', 'Sales and marketing'),
    ('ops', 'Operations', '🎯', 'Management and coordination');

-- Default data: Teams  
INSERT INTO teams (id, department_id, name, emoji, description) VALUES
    ('content-squad', 'content', 'Content Squad', '✍️', 'Blog posts, articles, copy'),
    ('seo-team', 'content', 'SEO Team', '🔍', 'Search optimization'),
    ('dev-team', 'tech', 'Dev Team', '💻', 'Software development'),
    ('devops-team', 'tech', 'DevOps Team', '🔧', 'Infrastructure and CI/CD'),
    ('leadership', 'ops', 'Leadership', '🎖️', 'Team leads and management');

-- Default data: Workspaces
INSERT INTO workspaces (id, name, slug, emoji, description) VALUES
    ('quantacodes', 'QuantaCodes', 'qc', '🚀', 'Main business operations'),
    ('internal', 'Internal', 'internal', '🏠', 'Internal tools and processes'),
    ('clients', 'Client Work', 'clients', '💼', 'Client projects');

-- Update existing agents with teams
UPDATE agents SET team_id = 'content-squad', department = 'Content' WHERE id = '9d59c008-49ef-4c';
UPDATE agents SET team_id = 'seo-team', department = 'Content' WHERE id = '1432c7a3-f144-42';
UPDATE agents SET team_id = 'leadership', department = 'Operations' WHERE id = '8f9b070f-c98c-4c';
