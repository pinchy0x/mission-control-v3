-- Mission Control v4 Safe Migration
-- Only creates tables if they don't exist

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

-- Default data: Departments (ignore if exists)
INSERT OR IGNORE INTO departments (id, name, emoji, description) VALUES
    ('content', 'Content', '✍️', 'Content creation and SEO'),
    ('tech', 'Technical', '💻', 'Development and DevOps'),
    ('growth', 'Growth', '📈', 'Sales and marketing'),
    ('ops', 'Operations', '🎯', 'Management and coordination');

-- Default data: Teams (ignore if exists)
INSERT OR IGNORE INTO teams (id, department_id, name, emoji, description) VALUES
    ('content-squad', 'content', 'Content Squad', '✍️', 'Blog posts, articles, copy'),
    ('seo-team', 'content', 'SEO Team', '🔍', 'Search optimization'),
    ('dev-team', 'tech', 'Dev Team', '💻', 'Software development'),
    ('devops-team', 'tech', 'DevOps Team', '🔧', 'Infrastructure and CI/CD'),
    ('leadership', 'ops', 'Leadership', '🎖️', 'Team leads and management'),
    ('growth-team', 'growth', 'Growth Team', '📈', 'Lead generation and outreach');

-- Default data: Workspaces (ignore if exists)
INSERT OR IGNORE INTO workspaces (id, name, slug, emoji, description) VALUES
    ('quantacodes', 'QuantaCodes', 'qc', '🚀', 'Main business operations'),
    ('internal', 'Internal', 'internal', '🏠', 'Internal tools and processes'),
    ('clients', 'Client Work', 'clients', '💼', 'Client projects');
