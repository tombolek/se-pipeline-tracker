-- Personal quota-group assignment per user — drives the "my quota" view used
-- for variable-comp tracking. Unlike the rule-based group matching in
-- quota_groups (which decides which deals count toward each group), this is a
-- single explicit pick per user. Nullable means "not assigned".
--
-- ON DELETE SET NULL: deleting a quota group should not block user deletion or
-- soft-delete the user — just clear the pointer.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS quota_group_id INTEGER
    REFERENCES quota_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_quota_group_idx ON users (quota_group_id);
