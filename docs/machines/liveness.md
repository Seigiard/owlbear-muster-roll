stateDiagram-v2
  offline --> online: heard
  offline --> offline: fired
  offline --> offline: watch
  online --> online: heard
  online --> offline: fired
  online --> online: fired
  online --> online: watch
