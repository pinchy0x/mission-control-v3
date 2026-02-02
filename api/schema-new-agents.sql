-- Additional Agents for v4
-- Run after schema-v4.sql

-- Lead Researcher (Growth)
INSERT INTO agents (id, name, role, status, level, avatar_emoji, session_key, team_id, department) VALUES
    ('lead-researcher-01', 'Lead-Researcher', 'Lead Researcher', 'idle', 'specialist', '🔍', 'agent:lead-researcher:main', 'growth-team', 'Growth');

-- Outreach Specialist (Growth)  
INSERT INTO agents (id, name, role, status, level, avatar_emoji, session_key, team_id, department) VALUES
    ('outreach-spec-01', 'Outreach-Specialist', 'Outreach Specialist', 'idle', 'specialist', '📧', 'agent:outreach-specialist:main', 'growth-team', 'Growth');

-- Tech Writer (Technical)
INSERT INTO agents (id, name, role, status, level, avatar_emoji, session_key, team_id, department) VALUES
    ('tech-writer-01', 'Tech-Writer', 'Technical Writer', 'idle', 'specialist', '📝', 'agent:tech-writer:main', 'dev-team', 'Technical');

-- DevTools (Technical)
INSERT INTO agents (id, name, role, status, level, avatar_emoji, session_key, team_id, department) VALUES
    ('devtools-01', 'DevTools', 'DevTools Engineer', 'idle', 'specialist', '🔧', 'agent:devtools:main', 'devops-team', 'Technical');

-- Social Media (Content)
INSERT INTO agents (id, name, role, status, level, avatar_emoji, session_key, team_id, department) VALUES
    ('social-media-01', 'Social-Media', 'Social Media Manager', 'idle', 'specialist', '📱', 'agent:social-media:main', 'content-squad', 'Content');

-- Add Growth team
INSERT INTO teams (id, department_id, name, emoji, description) VALUES
    ('growth-team', 'growth', 'Growth Team', '📈', 'Lead generation and outreach');
