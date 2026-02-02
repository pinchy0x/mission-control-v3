-- Task Dependencies Schema
-- Junction table for blocked-by/depends-on relationships

CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id TEXT NOT NULL,
    depends_on_task_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (task_id, depends_on_task_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CHECK (task_id != depends_on_task_id)  -- Prevent self-references
);

-- Index for fast lookup of what blocks a task
CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);

-- Index for fast lookup of what a task blocks
CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on_task_id);
