# Status Change Hooks Guide

## Configuration Examples

### Notifications

Below, I'll provide an example using the [noti](https://github.com/variadico/noti) command. You don't necessarily have to use `noti`. Please customize it as needed.

Configure CCLens to send notifications for each status:

1. Run `cclens`
2. Navigate to **Global Configuration** → **Configure Status Hooks**
3. Set up the following hooks:

**Idle Hook:**
```bash
noti -t "Claude Code" -m "Session is now idle in $CCLENS_WORKTREE_BRANCH"
```

**Busy Hook:**
```bash
noti -t "Claude Code" -m "Session is now busy on branch $CCLENS_WORKTREE_BRANCH"
```

**Waiting for Input Hook:**
```bash
noti -t "Claude Code" -m "Claude is waiting for your input in $CCLENS_WORKTREE_BRANCH branch"
```

#### Integration with Other Tools

**Send to Slack (using webhook):**
```bash
curl -X POST -H 'Content-type: application/json' --data '{"text":"Claude is now '"$CCLENS_NEW_STATE"' in '"$CCLENS_WORKTREE_PATH"'"}' YOUR_SLACK_WEBHOOK_URL
```

**Update tmux status:**
```bash
tmux set -g status-right "Claude: $CCLENS_NEW_STATE" && noti -t "Claude Status" -m "$CCLENS_NEW_STATE"
```

## Troubleshooting

- Ensure commands is in your PATH
- Test commands in terminal first before adding to CCLens
- Remember that hooks run in the worktree directory context

## Environment Variables Reference

- `CCLENS_OLD_STATE`: Previous state (idle, busy, waiting_input)
- `CCLENS_NEW_STATE`: New state (idle, busy, waiting_input)
- `CCLENS_WORKTREE_PATH`: Path to the worktree where status changed
- `CCLENS_WORKTREE_DIR`: Directory name of the worktree (basename only)
- `CCLENS_WORKTREE_BRANCH`: Git branch name of the worktree
- `CCLENS_SESSION_ID`: Unique session identifier
