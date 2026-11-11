# Low-level topology

```text
MARKOV terminal create --worktree active --title <task_name> --command "<agent_command>" --json
MARKOV terminal wait --terminal <handle> --for tui-idle --timeout-ms 60000 --json
MARKOV orchestration dispatch --task <task_id> --to <handle> --inject
```

To give a Task to a terminal or chat Markov did not start:

```text
MARKOV orchestration worker-start --task <task_id> --terminal <handle> --worktree <its_workspace> --json
```
